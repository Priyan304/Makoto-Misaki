import ssl
import unittest
import httpx
from backend.tls import cloud_ssl_context
from backend.providers import provider_error


class CloudTlsTests(unittest.TestCase):
    def test_system_store_keeps_certificate_and_hostname_checks(self):
        context = cloud_ssl_context()
        self.assertEqual(context.verify_mode, ssl.CERT_REQUIRED)
        self.assertTrue(context.check_hostname)

    def test_certificate_failure_is_specific_and_sanitized(self):
        failure = httpx.ConnectError('do-not-show-credential')
        failure.__cause__ = ssl.SSLCertVerificationError('do-not-show-credential')
        error = provider_error('gemini', failure)
        self.assertEqual(error.status_code, 503)
        self.assertIn('certificate verification failed', error.detail)
        self.assertNotIn('do-not-show-credential', error.detail)
