# SPDX-License-Identifier: Apache-2.0
"""Verify downloaded report content against its MCOP receipts and optional anchor."""
import argparse
import json
from mcop.reasoning_receipts import verify_receipt


def verify(report, anchor=None):
    try:
        bundle = report['provenance']
        receipts = bundle['receipts']
        claims = bundle['claims']
        if not claims or len(receipts) != len(claims) or bundle['size'] != len(claims):
            return False
        if anchor is not None and bundle['root'] != anchor:
            return False
        expected = [claims[0], report['summary'], *report['findings']]
        if claims != expected:
            return False
        for index, (receipt, claim) in enumerate(zip(receipts, claims)):
            if (not verify_receipt(receipt).valid or receipt['root'] != bundle['root']
                    or receipt['claim'] != claim or receipt['leafIndex'] != index
                    or receipt['size'] != len(claims)):
                return False
        return True
    except (KeyError, TypeError, ValueError):
        return False


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('report')
    parser.add_argument('--root', help='Previously saved trusted root, if available')
    args = parser.parse_args()
    valid = verify(json.load(open(args.report)), args.root)
    print('PASS: committed diagnostics intact (not proof of truth)' if valid else 'FAIL: invalid report')
    raise SystemExit(0 if valid else 1)
