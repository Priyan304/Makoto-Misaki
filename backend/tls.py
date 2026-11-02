"""Use OS certificate trust for cloud HTTPS, without changing global SSL behavior."""
import ssl
import truststore


def cloud_ssl_context() -> ssl.SSLContext:
    return truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
