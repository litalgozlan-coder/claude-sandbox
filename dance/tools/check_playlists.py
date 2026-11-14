#!/usr/bin/env python3
"""Check that every Spotify playlist the game uses really loads in Spotify's embedded player.

The embed page answers HTTP 200 even for a playlist it will not show (a playlist Spotify generated for a search, a
personal mix, a private or deleted playlist): the player then says "Page not found" and the lesson gets no music.
So this looks for the track list inside the page.

usage: python3 dance/tools/check_playlists.py [path/to/index.html]     exit code 1 if any playlist is broken
"""
import json, re, subprocess, sys

UA = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36"
TABLES = ["HH_PLAYLISTS", "ZB_PLAYLISTS", "HH_DANCE_PLAYLISTS", "ZB_DANCE_PLAYLISTS"]


def check(pid):
    body = subprocess.run(["curl", "-sS", "-m", "25", "-A", UA, "https://open.spotify.com/embed/playlist/" + pid],
                          capture_output=True, text=True).stdout
    return ('"trackList"' in body, len(re.findall(r'"uri":"spotify:track:', body)),
            len(re.findall(r'"isExplicit":true', body)))


def main():
    src = open(sys.argv[1] if len(sys.argv) > 1 else "dance/index.html", encoding="utf8").read()
    broken = 0
    for table in TABLES:
        m = re.search(r"const " + table + r" = (\[.*?\]);", src, re.S)
        if not m:
            print("missing table", table); broken += 1; continue
        for pl in json.loads(m.group(1)):
            pid = pl["url"].split("/playlist/")[1].split("?")[0]
            ok, tracks, explicit = check(pid)
            broken += 0 if ok else 1
            print(f"{table:19} {'ok    ' if ok else 'BROKEN'} {pid} tracks {tracks:3} explicit {explicit:3} | {pl['name']}")
    print("all playlists load" if not broken else f"{broken} broken")
    return 1 if broken else 0


if __name__ == "__main__":
    sys.exit(main())
