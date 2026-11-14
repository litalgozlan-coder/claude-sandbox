#!/usr/bin/env python3
"""Check that every Spotify playlist the game uses really loads in Spotify's embedded player.

The embed page answers HTTP 200 even for a playlist it will not show (a playlist Spotify generated for a search, a
personal mix, a private or deleted playlist): the player then says "Page not found" and the lesson gets no music.
So this looks for the track list inside the page. It also fails on a playlist with a song whose title or artist is
written in Hebrew: the game is meant to play no songs in Hebrew.

usage: python3 dance/tools/check_playlists.py [path/to/index.html]     exit code 1 if any playlist must be replaced
"""
import json, re, subprocess, sys

UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"
TABLES = ["HH_PLAYLISTS", "ZB_PLAYLISTS", "HH_DANCE_PLAYLISTS", "ZB_DANCE_PLAYLISTS"]


HEBREW = re.compile(r"[\u0590-\u05FF]")


def track_list(obj):
    if isinstance(obj, dict):
        if "trackList" in obj:
            return obj["trackList"]
        obj = list(obj.values())
    if isinstance(obj, list):
        for v in obj:
            found = track_list(v)
            if found is not None:
                return found
    return None


def check(pid):
    """(loads, tracks, explicit tracks, tracks with Hebrew in the title or artist) for the first 100 tracks."""
    body = subprocess.run(["curl", "-sS", "-m", "25", "-A", UA, "https://open.spotify.com/embed/playlist/" + pid],
                          capture_output=True, text=True).stdout
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', body, re.S)
    tracks = track_list(json.loads(m.group(1))) if m else None
    if not tracks:
        return False, 0, 0, 0
    hebrew = sum(1 for t in tracks if HEBREW.search((t.get("title") or "") + " " + (t.get("subtitle") or "")))
    return True, len(tracks), sum(1 for t in tracks if t.get("isExplicit")), hebrew


def main():
    src = open(sys.argv[1] if len(sys.argv) > 1 else "dance/index.html", encoding="utf8").read()
    broken = 0
    for table in TABLES:
        m = re.search(r"const " + table + r" = (\[.*?\]);", src, re.S)
        if not m:
            print("missing table", table); broken += 1; continue
        for pl in json.loads(m.group(1)):
            pid = pl["url"].split("/playlist/")[1].split("?")[0]
            ok, tracks, explicit, hebrew = check(pid)
            bad = not ok or hebrew > 0
            broken += 1 if bad else 0
            print(f"{table:19} {'ok    ' if not bad else 'BROKEN' if not ok else 'HEBREW'} {pid} tracks {tracks:3} explicit {explicit:3} hebrew {hebrew:3} | {pl['name']}")
    print("all playlists load, none has a song in Hebrew" if not broken else f"{broken} to replace")
    return 1 if broken else 0


if __name__ == "__main__":
    sys.exit(main())
