"""Public posts the Lead Scout reads. Read-only: nothing here posts, comments or messages anyone.

* Reddit through its official API (an app-only OAuth token from a free "script" app). Without the
  credentials Reddit is simply skipped.
* RSS or Atom feeds the owner lists in the scout's config, fetched only when the site's robots.txt
  allows our user agent. Only the feed itself is read, never the pages it links to.
"""
from __future__ import annotations

import html
import logging
import re
import time
import urllib.parse
import urllib.robotparser
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

import httpx

log = logging.getLogger(__name__)

MAX_FEED_BYTES = 2_000_000
TAG = re.compile(r"<[^>]+>")


@dataclass
class Post:
    source: str  # reddit | feed
    source_detail: str
    url: str
    title: str
    text: str
    author: str | None
    posted_at: datetime | None


def clean(text: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(TAG.sub(" ", text or ""))).strip()


class Reddit:
    """App-only access to Reddit's official API. Reddit asks for a descriptive user agent naming the account."""

    TOKEN_URL = "https://www.reddit.com/api/v1/access_token"
    API = "https://oauth.reddit.com"

    def __init__(self, client_id: str, client_secret: str, user_agent: str, http: httpx.Client | None = None):
        self.client_id = client_id
        self.client_secret = client_secret
        self.user_agent = user_agent
        self.http = http or httpx.Client(timeout=30)
        self._token: str | None = None
        self._token_until = 0.0

    @property
    def configured(self) -> bool:
        return bool(self.client_id and self.client_secret and self.user_agent)

    def _auth(self) -> dict[str, str]:
        if not self._token or time.time() > self._token_until:
            res = self.http.post(self.TOKEN_URL, data={"grant_type": "client_credentials"},
                                 auth=(self.client_id, self.client_secret), headers={"User-Agent": self.user_agent})
            res.raise_for_status()
            data = res.json()
            self._token = data["access_token"]
            self._token_until = time.time() + int(data.get("expires_in", 3600)) - 60
        return {"Authorization": f"bearer {self._token}", "User-Agent": self.user_agent}

    def _listing(self, path: str, params: dict) -> list[Post]:
        res = self.http.get(f"{self.API}{path}", params={**params, "raw_json": 1}, headers=self._auth())
        res.raise_for_status()
        out = []
        for child in (res.json().get("data") or {}).get("children") or []:
            d = child.get("data") or {}
            if d.get("over_18") or d.get("removed_by_category") or d.get("author") in (None, "[deleted]", "AutoModerator"):
                continue
            out.append(Post(
                source="reddit", source_detail="r/" + str(d.get("subreddit") or ""),
                url="https://www.reddit.com" + str(d.get("permalink") or ""),
                title=str(d.get("title") or "")[:300], text=str(d.get("selftext") or "")[:4000],
                author="u/" + str(d["author"]),
                posted_at=datetime.fromtimestamp(float(d["created_utc"]), tz=timezone.utc) if d.get("created_utc") else None,
            ))
        return out

    def new_posts(self, subreddit: str, limit: int = 100) -> list[Post]:
        return self._listing(f"/r/{subreddit}/new", {"limit": limit})

    def search(self, query: str, subreddit: str | None = None, limit: int = 50) -> list[Post]:
        params = {"q": query, "sort": "new", "t": "week", "limit": limit, "type": "link"}
        if subreddit:
            return self._listing(f"/r/{subreddit}/search", {**params, "restrict_sr": 1})
        return self._listing("/search", params)


class Feeds:
    """Public RSS/Atom feeds, read only where robots.txt allows it."""

    def __init__(self, user_agent: str, http: httpx.Client | None = None):
        self.user_agent = user_agent
        self.http = http or httpx.Client(timeout=30, follow_redirects=True)
        self._robots: dict[str, urllib.robotparser.RobotFileParser | None] = {}

    def allowed(self, url: str) -> bool:
        parts = urllib.parse.urlsplit(url)
        if parts.scheme not in ("http", "https"):
            return False
        base = f"{parts.scheme}://{parts.netloc}"
        if base not in self._robots:
            self._robots[base] = self._load_robots(base)
        rp = self._robots[base]
        return rp is not None and rp.can_fetch(self.user_agent, url)

    def _load_robots(self, base: str) -> urllib.robotparser.RobotFileParser | None:
        """No robots.txt (4xx) means allowed; a site we cannot reach or that errors is left alone."""
        rp = urllib.robotparser.RobotFileParser()
        try:
            res = self.http.get(base + "/robots.txt", headers={"User-Agent": self.user_agent})
        except httpx.HTTPError:
            return None
        if res.status_code >= 500:
            return None
        rp.parse([] if res.status_code >= 400 else res.text.splitlines())
        return rp

    def read(self, url: str) -> list[Post]:
        if not self.allowed(url):
            raise PermissionError(f"robots.txt does not allow {url}")
        res = self.http.get(url, headers={"User-Agent": self.user_agent})
        res.raise_for_status()
        if len(res.content) > MAX_FEED_BYTES:
            raise ValueError(f"feed too large: {url}")
        return parse_feed(res.content, urllib.parse.urlsplit(url).netloc)


def _date(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        d = parsedate_to_datetime(value)
    except (TypeError, ValueError):
        try:
            d = datetime.fromisoformat(value.strip().replace("Z", "+00:00"))
        except ValueError:
            return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def parse_feed(content: bytes, site: str) -> list[Post]:
    """RSS 2.0 items or Atom entries. Feeds never carry a DTD we need, so any is refused."""
    if b"<!DOCTYPE" in content[:2000].upper() or b"<!ENTITY" in content[:5000].upper():
        raise ValueError("feed declares a DTD")
    root = ET.fromstring(content)
    atom = "{http://www.w3.org/2005/Atom}"
    out: list[Post] = []
    for item in root.iter("item"):
        link = (item.findtext("link") or "").strip()
        if not link:
            continue
        out.append(Post("feed", site, link, clean(item.findtext("title") or "")[:300],
                        clean(item.findtext("description") or "")[:4000],
                        clean(item.findtext("{http://purl.org/dc/elements/1.1/}creator") or item.findtext("author") or "") or None,
                        _date(item.findtext("pubDate"))))
    for entry in root.iter(f"{atom}entry"):
        link_el = entry.find(f"{atom}link[@rel='alternate']")
        if link_el is None:  # an Element with no children is falsy, so no `or` here
            link_el = entry.find(f"{atom}link")
        link = (link_el.get("href") if link_el is not None else "") or ""
        if not link:
            continue
        out.append(Post("feed", site, link.strip(), clean(entry.findtext(f"{atom}title") or "")[:300],
                        clean(entry.findtext(f"{atom}content") or entry.findtext(f"{atom}summary") or "")[:4000],
                        clean(entry.findtext(f"{atom}author/{atom}name") or "") or None,
                        _date(entry.findtext(f"{atom}published") or entry.findtext(f"{atom}updated"))))
    return out
