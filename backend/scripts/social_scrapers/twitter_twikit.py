import asyncio
import json
import os
import sys
from pathlib import Path


def read_payload():
    raw = sys.stdin.read().strip()
    return json.loads(raw) if raw else {}


def ensure_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} manquant dans backend/.env")
    return value


def normalize_limit(value, fallback=50, upper=200):
    try:
        parsed = int(value)
    except Exception:
        parsed = fallback
    return max(1, min(parsed, upper))


def patch_twikit_key_byte_indices():
    try:
        from twikit.x_client_transaction.transaction import ClientTransaction
    except Exception:
        return

    original_get_indices = ClientTransaction.get_indices

    async def patched_get_indices(self, home_page_response, session, headers):
        try:
            return await original_get_indices(self, home_page_response, session, headers)
        except Exception as exc:
            if "Couldn't get KEY_BYTE indices" not in str(exc):
                raise

            # Fallback for the current X ondemand bundle format where Twikit's
            # legacy regex no longer extracts the row/key-byte indices.
            return 14, [5, 21, 24]

    ClientTransaction.get_indices = patched_get_indices


async def main():
    payload = read_payload()
    search_term = (payload.get("searchTerm") or "").strip()
    max_items = normalize_limit(payload.get("maxItems"), fallback=50, upper=250)

    if not search_term:
        raise RuntimeError("searchTerm manquant")

    try:
        from twikit import Client
    except Exception as exc:
        raise RuntimeError(
            "twikit n'est pas installe dans l'environnement Python. Installez les dependances Python du backend."
        ) from exc

    patch_twikit_key_byte_indices()

    cookies_dir = Path(__file__).resolve().parents[2] / "data"
    cookies_dir.mkdir(parents=True, exist_ok=True)
    cookies_file = Path(os.getenv("TWIKIT_COOKIES_FILE", cookies_dir / "twikit_cookies.json"))

    username = os.getenv("TWITTER_USERNAME", "").strip()
    email = os.getenv("TWITTER_EMAIL", "").strip()
    password = os.getenv("TWITTER_PASSWORD", "").strip()
    totp_secret = os.getenv("TWITTER_TOTP_SECRET", "").strip() or None

    if not cookies_file.exists() and (not username or not password):
      raise RuntimeError(
          "Configurez TWIKIT_COOKIES_FILE existant ou TWITTER_USERNAME/TWITTER_EMAIL/TWITTER_PASSWORD dans backend/.env"
      )

    client = Client("en-US")

    if cookies_file.exists():
        client.load_cookies(str(cookies_file))
    else:
        await client.login(
            auth_info_1=username,
            auth_info_2=email or username,
            password=password,
            totp_secret=totp_secret,
            cookies_file=str(cookies_file)
        )

    tweets = await client.search_tweet(search_term, "Latest", count=max_items)
    rows = []

    for index, tweet in enumerate(tweets):
        if index >= max_items:
            break
        user = getattr(tweet, "user", None)
        rows.append({
            "id": str(getattr(tweet, "id", "")) or None,
            "url": f"https://x.com/{getattr(user, 'screen_name', 'i')}/status/{getattr(tweet, 'id', '')}" if getattr(tweet, "id", None) else None,
            "text": getattr(tweet, "text", None),
            "created_at": getattr(tweet, "created_at", None),
            "lang": getattr(tweet, "lang", None),
            "favorite_count": getattr(tweet, "favorite_count", 0) or 0,
            "retweet_count": getattr(tweet, "retweet_count", 0) or 0,
            "reply_count": getattr(tweet, "reply_count", 0) or 0,
            "view_count": getattr(tweet, "view_count", 0) or 0,
            "author_name": getattr(user, "name", None),
            "author_screen_name": getattr(user, "screen_name", None),
            "author_verified": bool(getattr(user, "is_blue_verified", False) or getattr(user, "verified", False)),
            "author_followers": getattr(user, "followers_count", 0) or 0
        })

    sys.stdout.write(json.dumps(rows, ensure_ascii=True))


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except Exception as error:
        sys.stderr.write(str(error))
        sys.exit(1)
