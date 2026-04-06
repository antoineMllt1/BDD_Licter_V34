import json
import os
import sys


def read_payload():
    raw = sys.stdin.read().strip()
    return json.loads(raw) if raw else {}


def ensure_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} manquant dans backend/.env")
    return value


def normalize_limit(value, fallback=30, upper=200):
    try:
        parsed = int(value)
    except Exception:
        parsed = fallback
    return max(1, min(parsed, upper))


def main():
    payload = read_payload()
    query = (payload.get("query") or "").strip()
    max_items = normalize_limit(payload.get("maxItems"), fallback=30, upper=200)

    if not query:
        raise RuntimeError("query manquant")

    try:
        import praw
    except Exception as exc:
        raise RuntimeError(
            "praw n'est pas installe dans l'environnement Python. Installez les dependances Python du backend."
        ) from exc

    reddit = praw.Reddit(
        client_id=ensure_env("REDDIT_CLIENT_ID"),
        client_secret=ensure_env("REDDIT_CLIENT_SECRET"),
        user_agent=ensure_env("REDDIT_USER_AGENT")
    )

    results = []
    for submission in reddit.subreddit("all").search(query, sort="new", time_filter="year", limit=max_items):
        text = "\n\n".join(part for part in [submission.title, getattr(submission, "selftext", "")] if part)
        results.append({
            "id": submission.id,
            "url": f"https://www.reddit.com{submission.permalink}",
            "title": submission.title,
            "text": text,
            "created_utc": submission.created_utc,
            "subreddit": str(submission.subreddit),
            "author": str(submission.author) if submission.author else None,
            "score": getattr(submission, "score", 0) or 0,
            "num_comments": getattr(submission, "num_comments", 0) or 0,
            "upvote_ratio": getattr(submission, "upvote_ratio", None)
        })

    sys.stdout.write(json.dumps(results, ensure_ascii=True))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        sys.stderr.write(str(error))
        sys.exit(1)
