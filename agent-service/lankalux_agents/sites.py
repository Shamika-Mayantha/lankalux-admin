"""Reads a business's own public website for the Partner agent: the home page and up to three
contact or about pages it links to, only where robots.txt allows, and only on public internet
addresses (never the VM's own network or the cloud metadata address). Returns plain text and the
email addresses the site publishes. Nothing is ever submitted to a site."""
from __future__ import annotations

import html
import ipaddress
import re
import socket
import urllib.parse
from dataclasses import dataclass, field

import httpx

from .sources import Feeds

MAX_PAGE_BYTES = 1_500_000
MAX_PAGE_TEXT = 6000
CONTACT_LINK = re.compile(r"contact|about|team|enquir|inquir|kontakt|contatt|contacto|impressum|nosotros|qui-sommes", re.I)
EMAIL = re.compile(r"[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,24}", re.I)
NOT_EMAIL = re.compile(r"\.(png|jpe?g|gif|webp|svg|css|js)$|^(example|test|your|name|email)@|@(example|sentry|wixpress|domain)\.", re.I)
HREF = re.compile(r"""<a\b[^>]*?href\s*=\s*["']([^"'#]+)["']""", re.I)
DROP = re.compile(r"<(script|style|noscript|svg|template)\b.*?</\1\s*>", re.I | re.S)
TAG = re.compile(r"<[^>]+>")


class BlockedAddress(ValueError):
    """The site resolves to a private, loopback, link-local or otherwise non-public address."""


def origin(url: str) -> str | None:
    """'https://www.Agent.com/contact?x' -> 'https://www.agent.com'. None for anything that is not a web address."""
    u = url.strip()
    if not re.match(r"^https?://", u, re.I):
        u = "https://" + u
    parts = urllib.parse.urlsplit(u)
    host = (parts.hostname or "").lower().rstrip(".")
    if parts.scheme.lower() not in ("http", "https") or "." not in host or not re.fullmatch(r"[a-z0-9.-]+", host):
        return None
    port = f":{parts.port}" if parts.port and parts.port not in (80, 443) else ""
    return f"{parts.scheme.lower()}://{host}{port}"


def public_host(host: str) -> bool:
    """False only for names that resolve to a non-public address. A name that does not resolve is left
    to the request itself, which then fails with a clear connection error."""
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return True
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global or ip.is_multicast:
            return False
    return True


def page_text(markup: str) -> str:
    t = DROP.sub(" ", markup)
    t = re.sub(r"<(br|p|div|li|h[1-6]|tr)\b[^>]*>", "\n", t, flags=re.I)
    t = html.unescape(TAG.sub(" ", t))
    t = re.sub(r"[ \t\r\f\v]+", " ", t)
    return re.sub(r"\n\s*\n+", "\n", t).strip()


def emails_in(markup: str) -> list[str]:
    found = re.findall(r"mailto:([^\"'?>\s]+)", markup, re.I) + EMAIL.findall(html.unescape(TAG.sub(" ", DROP.sub(" ", markup))))
    out: list[str] = []
    for e in found:
        e = urllib.parse.unquote(e).strip().strip(".").lower()
        if EMAIL.fullmatch(e) and not NOT_EMAIL.search(e) and e not in out:
            out.append(e)
    return out


# Addresses for a partnership enquiry about Sri Lanka, best first; and ones that are never right for it.
PREFERRED = ("sri", "lanka", "indian.ocean", "indianocean", "asia", "india", "partner", "product", "trade", "b2b",
             "info", "enquir", "inquir", "hello", "contact", "sales", "reservations", "groups", "travel")
UNSUITABLE = re.compile(r"^(no-?reply|support|customer|help|flight|ticket|account|finance|billing|invoice|job|career|hr|"
                        r"press|media|marketing|privacy|gdpr|legal|webmaster|admin|abuse|voucher|complaint)", re.I)


def best_email(emails: list[str], site: str) -> str | None:
    """The site's own address that best suits a Sri Lanka partnership enquiry. Support, accounts, press and
    the like are used only when the site publishes nothing else."""
    host = (urllib.parse.urlsplit(site).hostname or "").removeprefix("www.")
    own = [e for e in emails if host.endswith(e.split("@")[1].removeprefix("www.")) or e.split("@")[1].endswith(host)]
    pool = own or emails
    for word in PREFERRED:
        for e in pool:
            if word in e.split("@")[0] and not UNSUITABLE.search(e):
                return e
    suitable = [e for e in pool if not UNSUITABLE.search(e)]
    return (suitable or pool or [None])[0]


@dataclass
class Site:
    origin: str
    pages: dict[str, str] = field(default_factory=dict)  # url -> plain text
    emails: list[str] = field(default_factory=list)
    contact_page: str | None = None
    skipped: dict[str, str] = field(default_factory=dict)

    def text(self, limit: int = 12000) -> str:
        return "\n\n".join(f"[{u}]\n{t}" for u, t in self.pages.items())[:limit]


class Sites:
    def __init__(self, user_agent: str, http: httpx.Client | None = None, *, check_host=public_host):
        self.user_agent = user_agent
        self.check_host = check_host
        self.http = http or httpx.Client(timeout=30, follow_redirects=True)
        self.http.event_hooks.setdefault("request", []).append(self._guard)
        self.robots = Feeds(user_agent, self.http)

    def _guard(self, request: httpx.Request) -> None:
        """Every request, redirects included, must go to a public internet address."""
        if not self.check_host(request.url.host):
            raise BlockedAddress(f"{request.url.host} is not a public internet address")

    def _get(self, url: str) -> str:
        if not self.robots.allowed(url):
            raise PermissionError("robots.txt does not allow it")
        res = self.http.get(url, headers={"User-Agent": self.user_agent, "Accept": "text/html"})
        res.raise_for_status()
        if "html" not in res.headers.get("content-type", "html"):
            raise ValueError("not a web page")
        if len(res.content) > MAX_PAGE_BYTES:
            raise ValueError("page too large")
        return res.text

    def read(self, site_origin: str) -> Site:
        site = Site(origin=site_origin)
        home_url = site_origin + "/"
        home = self._get(home_url)  # errors here mean the site cannot be read at all
        site.pages[home_url] = page_text(home)[:MAX_PAGE_TEXT]
        site.emails = emails_in(home)
        host = urllib.parse.urlsplit(site_origin).hostname
        links: list[str] = []
        for href in HREF.findall(home):
            url = urllib.parse.urljoin(home_url, html.unescape(href.strip()))
            parts = urllib.parse.urlsplit(url)
            if parts.hostname == host and CONTACT_LINK.search(parts.path) and url not in links and url.rstrip("/") != site_origin:
                links.append(url.split("#")[0])
        for url in (links or [site_origin + "/contact"])[:3]:
            try:
                markup = self._get(url)
            except (httpx.HTTPError, PermissionError, ValueError) as err:
                site.skipped[url] = str(err)[:200]
                continue
            site.pages[url] = page_text(markup)[:MAX_PAGE_TEXT]
            for e in emails_in(markup):
                if e not in site.emails:
                    site.emails.append(e)
            if site.contact_page is None and re.search(r"contact|kontakt|contatt|contacto|enquir|inquir", url, re.I):
                site.contact_page = url
        return site
