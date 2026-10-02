"""Download every named road segment around Shanghai from Overture Maps (OpenStreetMap-derived).

Only the row groups whose bounding boxes overlap Shanghai are fetched, using HTTP range requests,
so the whole run moves a few hundred MB instead of the full global dataset.
Output: work/segments.jsonl (one segment per line, WKB geometry in WGS-84).
"""
import concurrent.futures as cf
import json
import re
import sys

import pyarrow.parquet as pq
import requests

from common import work

BASE = 'https://overturemaps-us-west-2.s3.us-west-2.amazonaws.com'
RELEASE = '2026-09-23.1'
PREFIX = f'release/{RELEASE}/theme=transportation/type=segment/'
X0, X1, Y0, Y1 = 120.85, 122.25, 30.65, 31.90   # generous box around Shanghai

session = requests.Session()


def list_keys():
    keys, token = [], None
    while True:
        params = {'list-type': '2', 'prefix': PREFIX}
        if token:
            params['continuation-token'] = token
        text = session.get(BASE + '/', params=params, timeout=60).text
        keys += re.findall(r'<Key>([^<]+)</Key>', text)
        m = re.search(r'<NextContinuationToken>([^<]+)</NextContinuationToken>', text)
        if not m:
            return [k for k in keys if k.endswith('.parquet')]
        token = m.group(1)


class RangeFile:
    """Minimal seekable file over HTTP range requests, enough for pyarrow."""

    def __init__(self, url):
        self.url, self.pos = url, 0
        self.size = int(session.head(url, timeout=60).headers['Content-Length'])

    def seek(self, off, whence=0):
        self.pos = off if whence == 0 else (self.pos + off if whence == 1 else self.size + off)
        return self.pos

    def tell(self):
        return self.pos

    def read(self, n=-1):
        if n is None or n < 0:
            n = self.size - self.pos
        if n == 0:
            return b''
        end = min(self.size, self.pos + n) - 1
        last = None
        for _ in range(4):
            try:
                r = session.get(self.url, headers={'Range': f'bytes={self.pos}-{end}'}, timeout=120)
                r.raise_for_status()
                break
            except requests.RequestException as e:
                last = e
        else:
            raise last
        self.pos += len(r.content)
        return r.content

    def readable(self):
        return True

    def seekable(self):
        return True

    @property
    def closed(self):
        return False

    def close(self):
        pass


def column(schema, path):
    for i in range(len(schema)):
        if schema.column(i).path == path:
            return i
    raise KeyError(path)


def scan(key):
    pf = pq.ParquetFile(RangeFile(BASE + '/' + key))
    md = pf.metadata
    ix = {k: column(md.schema, 'bbox.' + k) for k in ('xmin', 'xmax', 'ymin', 'ymax')}
    rows = []
    for rg in range(md.num_row_groups):
        st = {k: md.row_group(rg).column(i).statistics for k, i in ix.items()}
        if all(s is not None and s.has_min_max for s in st.values()):
            if st['xmin'].min > X1 or st['xmax'].max < X0 or st['ymin'].min > Y1 or st['ymax'].max < Y0:
                continue
        for row in pf.read_row_group(rg, columns=['id', 'bbox', 'subtype', 'class', 'names', 'geometry']).to_pylist():
            b = row['bbox']
            if b['xmax'] < X0 or b['xmin'] > X1 or b['ymax'] < Y0 or b['ymin'] > Y1:
                continue
            if row['subtype'] != 'road' or not (row['names'] or {}).get('primary'):
                continue
            rows.append({'id': row['id'], 'cls': row['class'], 'name': row['names']['primary'],
                         'wkb': row['geometry'].hex()})
    return rows


if __name__ == '__main__':
    keys = list_keys()
    print('parquet files:', len(keys), file=sys.stderr)
    total = 0
    with open(work('segments.jsonl'), 'w', encoding='utf-8') as out, cf.ThreadPoolExecutor(8) as ex:
        for rows in ex.map(scan, keys):
            for r in rows:
                out.write(json.dumps(r, ensure_ascii=False) + '\n')
            total += len(rows)
    print('named road segments:', total, file=sys.stderr)
