#!/usr/bin/env python3
"""
Minimal training skeleton for image classification dataset stored in `backend/ml_dataset`.
This script is intentionally small: it loads annotations, prints class counts, and demonstrates how
to extend to a full training loop (PyTorch / torchvision / Ultralytics).

Run: python train.py --data ../ml_dataset --epochs 5
"""
import argparse
import json
import os
from collections import Counter
from PIL import Image

parser = argparse.ArgumentParser()
parser.add_argument('--data', type=str, default='backend/ml_dataset', help='path to dataset folder')
parser.add_argument('--epochs', type=int, default=3)
args = parser.parse_args()

ann_file = os.path.join(args.data, 'annotations.jsonl')
images_dir = os.path.join(args.data, 'images')

if not os.path.exists(ann_file):
    print('No annotations.jsonl found in', args.data)
    exit(1)

labels = []
entries = []
with open(ann_file, 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if not line: continue
        obj = json.loads(line)
        entries.append(obj)
        for l in obj.get('labels', []): labels.append(l)

print('Loaded', len(entries), 'annotations')
print('Class counts:')
for k,v in Counter(labels).most_common():
    print(f'  {k}: {v}')

# Quick sanity check: try opening first few images
for i, e in enumerate(entries[:5]):
    p = os.path.join(args.data, e['image'])
    if not os.path.exists(p):
        print('Missing image:', p)
        continue
    try:
        im = Image.open(p)
        print('Image', p, 'size', im.size)
        im.close()
    except Exception as ex:
        print('Failed to open', p, ex)

print('\nThis is a skeleton. Replace this with a proper training loop using PyTorch or Ultralytics YOLO.')
