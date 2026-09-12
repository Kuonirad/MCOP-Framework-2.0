# SPDX-License-Identifier: Apache-2.0
"""Restart-safe fulfillment recovery. Run alongside the API with the same DB."""
import logging
import time
from .app import Settings, database, fulfill, initialize


def recover(settings):
    with database(settings) as db:
        rows = db.execute("SELECT id FROM orders WHERE status='paid' AND mode=? LIMIT 20", (settings.mode,)).fetchall()
    for row in rows:
        try:
            fulfill(settings, row['id'])
        except Exception:
            # Log order IDs only; no customer input, credentials, or report contents.
            logging.error('Fulfillment failed for order %s; retrying next cycle', row['id'])


if __name__ == '__main__':
    settings = Settings()
    initialize(settings)
    while True:
        recover(settings)
        time.sleep(30)
