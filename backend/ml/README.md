Dataset & Training quickstart

This folder contains helper materials for collecting labeled images and running a baseline training job for a vision model.

1) Collecting labeled images
- Use the backend endpoint POST `/debug/label_image` to upload labeled images:
  - Body JSON: { "image_base64": "data:image/jpeg;base64,...", "labels": ["salmon","asparagus"], "filename": "optional.jpg" }
  - Uploaded images are stored under `backend/ml_dataset/images` and annotations are appended to `backend/ml_dataset/annotations.jsonl`.

2) Dataset format
- `annotations.jsonl` contains one JSON object per line: {"image":"images/IMG_001.jpg","labels":["salmon","asparagus"],"timestamp":"..."}

3) Training
- `train.py` is a minimal starter script showing how to load images and labels. It's a skeleton you can extend to fine-tune a classifier or detection model (e.g., YOLOv8, Detectron2, or PyTorch Lightning).

4) Recommended next steps
- Decide whether you want multi-label classification or object detection.
- Collect at least 500 images per common class for a baseline.
- Use a GPU for training. For quick tests, use a small subset and fewer epochs.

5) Example commands
- Install deps: `pip install torch torchvision pillow tqdm` (or install Ultralytics for YOLO)
- Run: `python train.py --data backend/ml_dataset --epochs 5`
