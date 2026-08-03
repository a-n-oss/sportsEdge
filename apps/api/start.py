"""Dual-stack uvicorn entrypoint for Railway private networking + healthchecks.

Railway private DNS is IPv6-only; platform healthchecks often probe over IPv4.
Binding an IPv6 socket with IPV6_V6ONLY=0 accepts both.
"""

from __future__ import annotations

import os
import socket

from uvicorn import Config, Server


def _dualstack_socket(port: int) -> socket.socket:
    sock = socket.socket(socket.AF_INET6, socket.SOCK_STREAM)
    sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
    try:
        sock.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
    except OSError:
        pass
    sock.bind(("::", port, 0, 0))
    sock.listen(2048)
    return sock


def main() -> None:
    port = int(os.environ.get("PORT", "8000"))
    config = Config(
        "main:app",
        host="::",
        port=port,
        proxy_headers=True,
        forwarded_allow_ips="*",
    )
    server = Server(config)

    try:
        sock = _dualstack_socket(port)
    except OSError as exc:
        print(f"dual-stack IPv6 bind failed ({exc}); falling back to 0.0.0.0")
        config.host = "0.0.0.0"
        server.run()
        return

    print(f"Listening dual-stack on [::]:{port} (IPv4+IPv6)")
    server.run(sockets=[sock])


if __name__ == "__main__":
    main()
