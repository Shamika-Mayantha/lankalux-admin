from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
import psycopg
import pytest
from pydantic import BaseModel

from lankalux_agents.actions import Actions
from lankalux_agents.agents import ALL_AGENTS, Context
from lankalux_agents.agents.scout import LeadReading, ScoutAgent, ScoutSources, quality_notes, wanted
from lankalux_agents.crm import CRM
from lankalux_agents.db import Database
from lankalux_agents.events import schedule
from lankalux_agents.leads import LeadStore
from lankalux_agents.memory import Memory
from lankalux_agents.queue import TaskQueue
from lankalux_agents.sources import Feeds, Post, Reddit, parse_feed
from lankalux_agents.worker import Worker

NOW = datetime.now(timezone.utc)


def post(title: str, text: str = "", sub: str = "srilanka", url: str | None = None, author: str = "u/traveller",
         age_days: float = 1) -> Post:
    return Post("reddit", f"r/{sub}", url or f"https://www.reddit.com/r/{sub}/comments/{abs(hash(title))}/", title, text,
                author, NOW - timedelta(days=age_days))


class FakeReddit:
    configured = True

    def __init__(self, posts: list[Post], fail: bool = False):
        self.posts = posts
        self.fail = fail
        self.calls: list[str] = []

    def new_posts(self, subreddit: str, limit: int = 100) -> list[Post]:
        self.calls.append(f"new:{subreddit}")
        if self.fail:
            raise httpx.ConnectError("reddit down")
        return [p for p in self.posts if p.source_detail == f"r/{subreddit}"]

    def search(self, query: str, subreddit: str | None = None, limit: int = 50) -> list[Post]:
        self.calls.append(f"search:{subreddit}")
        return [] if self.fail else [p for p in self.posts if subreddit and p.source_detail == f"r/{subreddit}"]


class FakeLLM:
    def __init__(self, reading: LeadReading | None = None):
        self.reading = reading or LeadReading(
            traveller=True, score=86, summary="Couple planning 10 days in March, wants a driver.",
            dates="March, 10 days", party="2 adults", places=["Sigiriya", "Ella"], budget="", interests="culture, tea country",
            reply="Hi there! Ten days is a lovely length — enough for the Cultural Triangle, Kandy and Ella without rushing. 🙂 "
                  "We run private driver-guide trips at LankaLux and are happy to help if useful.",
            reason="Actively planning and asking about drivers.")
        self.calls: list[str] = []
        self.users: list[str] = []

    def structured(self, system, user, schema: type[BaseModel], **_):
        self.calls.append(schema.__name__)
        self.users.append(user)
        assert schema is LeadReading
        return self.reading

    def embed(self, text):
        raise AssertionError("not used")


def make_worker(dsn: str, llm, reddit) -> Worker:
    db = Database(dsn, max_size=2)
    ctx = Context(queue=TaskQueue(db, "test-worker", 60), llm=llm, actions=Actions(db), crm=CRM(db), memory=Memory(db, llm),
                  leads=LeadStore(db), sources=ScoutSources(reddit=reddit, feeds=None))
    return Worker(ctx, db, {cls.key: cls() for cls in ALL_AGENTS}, poll_seconds=0)


def drain(w: Worker, limit: int = 40) -> int:
    n = 0
    while n < limit and w.tick():
        n += 1
    return n


# --------------------------------------------------------------------------- plain code


def test_keyword_filter_keeps_trip_planners_only():
    sri = {"srilanka"}
    assert wanted(post("Need a driver for 10 days in March"), sri)
    assert not wanted(post("Fuel prices again"), sri)  # a local news post in r/srilanka
    # Elsewhere the post has to be about Sri Lanka too.
    assert wanted(post("Honeymoon in Sri Lanka, itinerary help", sub="honeymoon"), sri)
    assert not wanted(post("Honeymoon in Bali, itinerary help", sub="honeymoon"), sri)


def test_quality_notes_flag_rule_breaks_and_fake_recommendations():
    notes = quality_notes("Check out LankaLux, they are great. Prices start at $50 a day.")
    hard = [n["note"] for n in notes if n["level"] == "hard"]
    assert any("price" in n for n in hard)
    assert any("speak as 'we'" in n for n in hard)
    assert quality_notes("Two nights in Ella is kinder than one. We run private driver-guide trips if it helps.") == []


def test_owner_config_only_overrides_with_the_right_type():
    ctx = Context(queue=None, llm=None, actions=None, crm=None, memory=None,
                  configs={"scout": {"subreddits_search": ["backpacking"], "max_new_per_run": "lots", "feeds": ["https://x.example/rss"]}})
    cfg = ScoutAgent().config(ctx)
    assert cfg["subreddits_search"] == ["backpacking"] and cfg["feeds"] == ["https://x.example/rss"]
    assert cfg["max_new_per_run"] == 12  # a bad value keeps the default


def test_searches_are_scheduled_at_nine_and_five():
    seen: list[str] = []

    class Q:
        def enqueue(self, agent, task_type, payload, **kw):
            seen.append(kw["dedupe_key"])

    schedule(Q(), datetime(2026, 10, 25, 10, 0, tzinfo=ZoneInfo("Asia/Colombo")))
    assert "leads:2026-10-25:9" in seen and "leads:2026-10-25:17" not in seen
    seen.clear()
    schedule(Q(), datetime(2026, 10, 25, 17, 5, tzinfo=ZoneInfo("Asia/Colombo")))
    assert {"leads:2026-10-25:9", "leads:2026-10-25:17"} <= set(seen)


def test_schedule_keeps_going_when_one_agent_is_not_installed():
    seen: list[str] = []

    class Q:
        def enqueue(self, agent, task_type, payload, **kw):
            if agent == "scout":
                raise psycopg.errors.ForeignKeyViolation("agent not installed")
            seen.append(agent)

    done: set[str] = set()
    schedule(Q(), datetime(2026, 10, 25, 18, 30, tzinfo=ZoneInfo("Asia/Colombo")), done)
    assert "manager" in seen and "followup" in seen


def test_rss_and_atom_feeds_are_read():
    rss = b"""<?xml version="1.0"?><rss><channel><item><title>Driver for Sri Lanka?</title>
      <link>https://forum.example/t/1</link><description>&lt;p&gt;We are 2 adults in &lt;b&gt;March&lt;/b&gt;&lt;/p&gt;</description>
      <pubDate>Sat, 24 Oct 2026 10:00:00 GMT</pubDate></item></channel></rss>"""
    p = parse_feed(rss, "forum.example")[0]
    assert (p.url, p.title, p.text) == ("https://forum.example/t/1", "Driver for Sri Lanka?", "We are 2 adults in March")
    assert p.posted_at == datetime(2026, 10, 24, 10, tzinfo=timezone.utc)
    atom = b"""<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Ella or Kandy?</title>
      <link rel="alternate" href="https://blog.example/c/2"/><summary>Which is better</summary>
      <author><name>sam</name></author><updated>2026-10-23T08:00:00Z</updated></entry></feed>"""
    p = parse_feed(atom, "blog.example")[0]
    assert (p.url, p.author) == ("https://blog.example/c/2", "sam")
    with pytest.raises(ValueError):
        parse_feed(b'<?xml version="1.0"?><!DOCTYPE x [<!ENTITY a "aaaa">]><rss/>', "bad.example")


def test_feeds_respect_robots_txt():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            if request.url.host == "closed.example":
                return httpx.Response(200, text="User-agent: *\nDisallow: /\n")
            if request.url.host == "down.example":
                return httpx.Response(503)
            return httpx.Response(404)
        return httpx.Response(200, content=b"<rss><channel></channel></rss>")

    feeds = Feeds("server:test", http=httpx.Client(transport=httpx.MockTransport(handler)))
    assert feeds.read("https://open.example/feed") == []
    assert not feeds.allowed("https://closed.example/feed")
    assert not feeds.allowed("https://down.example/feed")  # can't check robots.txt: leave it alone
    with pytest.raises(PermissionError):
        feeds.read("https://closed.example/feed")


def test_reddit_uses_the_official_api_and_skips_nsfw_and_deleted():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        if request.url.path == "/api/v1/access_token":
            return httpx.Response(200, json={"access_token": "t0k", "expires_in": 3600})
        child = lambda **d: {"data": {"subreddit": "srilanka", "permalink": f"/r/srilanka/comments/{d['id']}/x/", "title": "Driver?",
                                      "selftext": "2 of us", "author": "amy", "created_utc": 1792800000, **d}}
        return httpx.Response(200, json={"data": {"children": [child(id="a"), child(id="b", over_18=True), child(id="c", author="[deleted]")]}})

    r = Reddit("id", "secret", "server:test (by /u/lankalux)", http=httpx.Client(transport=httpx.MockTransport(handler)))
    posts = r.new_posts("srilanka")
    assert [p.url for p in posts] == ["https://www.reddit.com/r/srilanka/comments/a/x/"]
    assert posts[0].author == "u/amy"
    assert seen[0].url.host == "www.reddit.com" and seen[1].url.host == "oauth.reddit.com"
    assert seen[1].headers["authorization"] == "bearer t0k" and "lankalux" in seen[1].headers["user-agent"]
    assert not Reddit("", "", "ua").configured


# --------------------------------------------------------------------------- with the database


def test_scan_saves_new_leads_once_and_the_model_reads_each(test_db):
    posts = [
        post("Looking for a private driver, 10 days in March", "2 adults, first time, culture and tea"),
        post("Sri Lanka itinerary check please", "Kandy, Ella, Mirissa in 12 days", sub="travel"),
        post("Power cuts in Colombo tonight?"),  # not a trip
        post("Driver recommendations from 2024", age_days=30),  # too old
        post("Our tour company has new driver packages", author="u/LankaLuxTravel"),  # our own account
    ]
    with psycopg.connect(test_db["admin"], autocommit=True) as c:  # the owner's setting, read by the worker
        c.execute("""UPDATE public.ai_agents SET config = '{"own_handles": ["LankaLuxTravel"]}' WHERE key = 'scout'""")
    llm = FakeLLM()
    w = make_worker(test_db["agent"], llm, FakeReddit(posts))
    w.ctx.queue.enqueue("scout", "scan_for_leads", {}, priority=1)
    drain(w)
    assert llm.calls == ["LeadReading", "LeadReading"]
    assert "Ignore" not in llm.users[0] and json.loads(llm.users[0])["title"]  # the post goes in as data
    with psycopg.connect(test_db["admin"]) as c:
        rows = c.execute("SELECT title, score, draft_reply, details, quality_notes, status FROM public.ai_leads ORDER BY title").fetchall()
        assert [r[0] for r in rows] == ["Looking for a private driver, 10 days in March", "Sri Lanka itinerary check please"]
        title, score, reply, details, notes, status = rows[0]
        assert score == 86 and status == "new"
        assert "—" not in reply and "🙂" not in reply  # no long dashes or emojis
        assert reply.startswith("Ten days")  # no "Hi there!" opener
        assert details["party"] == "2 adults" and details["places"] == ["Sigiriya", "Ella"]
        assert notes == []
        # A strong lead pings the owner.
        assert c.execute("SELECT count(*) FROM public.ai_notifications WHERE kind = 'attention' AND title LIKE 'Strong lead%%'").fetchone()[0] == 2

    # The next search finds the same posts: nothing new, nothing read twice.
    w.ctx.queue.enqueue("scout", "scan_for_leads", {"force": True}, priority=1)
    drain(w)
    assert llm.calls == ["LeadReading", "LeadReading"]
    with psycopg.connect(test_db["admin"]) as c:
        assert c.execute("SELECT count(*) FROM public.ai_leads").fetchone()[0] == 2


def test_a_second_search_too_soon_is_skipped(test_db):
    reddit = FakeReddit([])
    w = make_worker(test_db["agent"], FakeLLM(), reddit)
    w.ctx.queue.enqueue("scout", "scan_for_leads", {}, priority=1, dedupe_key="leads:a")
    drain(w)
    calls = len(reddit.calls)
    w.ctx.queue.enqueue("scout", "scan_for_leads", {}, priority=1, dedupe_key="leads:b")
    drain(w)
    assert len(reddit.calls) == calls


def test_reddit_down_does_not_fail_the_search(test_db):
    w = make_worker(test_db["agent"], FakeLLM(), FakeReddit([], fail=True))
    w.ctx.queue.enqueue("scout", "scan_for_leads", {}, priority=1)
    drain(w)
    with psycopg.connect(test_db["admin"]) as c:
        status, result = c.execute("SELECT status, result FROM public.ai_tasks WHERE task_type = 'scan_for_leads'").fetchone()
    assert status == "succeeded" and result["reddit"]["errors"]


def test_not_a_traveller_scores_low_and_does_not_ping(test_db):
    llm = FakeLLM(LeadReading(traveller=False, score=70, summary="A local driver advertising.", dates="", party="",
                                  places=[], budget="", interests="", reply="", reason="Competitor."))
    w = make_worker(test_db["agent"], llm, FakeReddit([post("Hire me as your driver, best rates", "WhatsApp me")]))
    w.ctx.queue.enqueue("scout", "scan_for_leads", {}, priority=1)
    drain(w)
    with psycopg.connect(test_db["admin"]) as c:
        assert c.execute("SELECT score FROM public.ai_leads").fetchone()[0] == 19
        assert c.execute("SELECT count(*) FROM public.ai_notifications").fetchone()[0] == 0


def test_paused_scout_does_no_work(test_db):
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        c.execute("UPDATE public.ai_agents SET paused = true WHERE key = 'scout'")
    reddit = FakeReddit([post("Driver for 10 days?")])
    w = make_worker(test_db["agent"], FakeLLM(), reddit)
    w.ctx.queue.enqueue("scout", "scan_for_leads", {}, priority=1)
    drain(w)
    assert reddit.calls == []


def test_agent_role_cannot_handle_leads_itself(test_db):
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        c.execute("""INSERT INTO public.ai_leads (source, url, title, status) VALUES
                     ('reddit', 'https://r.example/1', 'open', 'new'), ('reddit', 'https://r.example/2', 'done', 'replied')""")
    with psycopg.connect(test_db["agent"], autocommit=True) as c:
        # Status, request and who handled it are the owner's.
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("UPDATE public.ai_leads SET status = 'converted' WHERE url = 'https://r.example/1'")
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("UPDATE public.ai_leads SET request_id = 'req-id-001' WHERE url = 'https://r.example/1'")
        # It cannot add a lead that looks already handled.
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("INSERT INTO public.ai_leads (source, url, status) VALUES ('reddit', 'https://r.example/3', 'replied')")
        # And once the owner dealt with a lead, the agent's reading of it is frozen.
        n = c.execute("UPDATE public.ai_leads SET score = 99 WHERE url = 'https://r.example/2'").rowcount
        assert n == 0
        with pytest.raises(psycopg.errors.InsufficientPrivilege):
            c.execute("DELETE FROM public.ai_leads")


def test_migration_can_run_twice(test_db):
    from conftest import ROOT
    sql = (ROOT.parent / "supabase" / "migrations" / "20261025000000_ai_lead_scout.sql").read_text()
    with psycopg.connect(test_db["admin"], autocommit=True) as c:
        c.execute(sql)
        assert c.execute("SELECT count(*) FROM public.ai_agents WHERE key = 'scout'").fetchone()[0] == 1
