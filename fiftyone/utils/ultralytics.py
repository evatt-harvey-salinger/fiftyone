"""
Utilities for working with
`Ultralytics <https://github.com/ultralytics/ultralytics>`_.

| Copyright 2017-2023, Voxel51, Inc.
| `voxel51.com <https://voxel51.com/>`_
|
"""
import itertools

import numpy as np
from PIL import Image

import fiftyone.core.utils as fou
import fiftyone.core.labels as fol
import fiftyone.utils.torch as fout
from fiftyone.core.models import Model

ultralytics = fou.lazy_import("ultralytics")


def to_detections(results, confidence_thresh=None):
    """Converts ``ultralytics.YOLO`` boxes to FiftyOne format.

    Args:
        results: a single or list of ``ultralytics.engine.results.Results``
        confidence_thresh (None): a confidence threshold to filter boxes

    Returns:
        a single or list of :class:`fiftyone.core.labels.Detections`
    """
    single = not isinstance(results, list)
    if single:
        results = [results]

    batch = [
        _to_detections(r, confidence_thresh=confidence_thresh) for r in results
    ]

    if single:
        return batch[0]

    return batch


def _to_detections(result, confidence_thresh=None):
    if result.boxes is None:
        return None

    classes = np.rint(result.boxes.cls.detach().cpu().numpy()).astype(int)
    boxes = result.boxes.xywhn.detach().cpu().numpy().astype(float)
    confs = result.boxes.conf.detach().cpu().numpy().astype(float)

    detections = []
    for cls, box, conf in zip(classes, boxes, confs):
        if confidence_thresh is not None and conf < confidence_thresh:
            continue

        label = result.names[cls]
        xc, yc, w, h = box

        detection = fol.Detection(
            label=label,
            bounding_box=[xc - 0.5 * w, yc - 0.5 * h, w, h],
            confidence=conf,
        )
        detections.append(detection)

    return fol.Detections(detections=detections)


def to_instances(results, confidence_thresh=None):
    """Converts ``ultralytics.YOLO`` instance segmentations to FiftyOne format.

    Args:
        results: a single or list of ``ultralytics.engine.results.Results``
        confidence_thresh (None): a confidence threshold to filter boxes

    Returns:
        a single or list of :class:`fiftyone.core.labels.Detections`
    """
    single = not isinstance(results, list)
    if single:
        results = [results]

    batch = [
        _to_instances(r, confidence_thresh=confidence_thresh) for r in results
    ]

    if single:
        return batch[0]

    return batch


def _uncenter_boxes(boxes):
    """convert from center coords to corner coords"""
    boxes[:, 0] -= boxes[:, 2] / 2.0
    boxes[:, 1] -= boxes[:, 3] / 2.0


def _to_instances(result, confidence_thresh=None):
    if result.masks is None:
        return None

    classes = np.rint(result.boxes.cls.detach().cpu().numpy()).astype(int)
    boxes = result.boxes.xywhn.detach().cpu().numpy().astype(float)
    masks = result.masks.data.detach().cpu().numpy() > 0.5
    confs = result.boxes.conf.detach().cpu().numpy().astype(float)

    _uncenter_boxes(boxes)

    detections = []
    for cls, box, mask, conf in zip(classes, boxes, masks, confs):
        if confidence_thresh is not None and conf < confidence_thresh:
            continue

        label = result.names[cls]
        w, h = mask.shape
        tmp = np.copy(box)
        tmp[2] += tmp[0]
        tmp[3] += tmp[1]
        tmp[0] *= h
        tmp[2] *= h
        tmp[1] *= w
        tmp[3] *= w
        tmp = [int(b) for b in tmp]
        y0, x0, y1, x1 = tmp
        sub_mask = mask[x0:x1, y0:y1]

        detection = fol.Detection(
            label=label,
            bounding_box=list(box),
            mask=sub_mask.astype(bool),
            confidence=conf,
        )
        detections.append(detection)

    return fol.Detections(detections=detections)


def to_polylines(results, confidence_thresh=None, tolerance=2, filled=True):
    """Converts ``ultralytics.YOLO`` instance segmentations to FiftyOne format.

    Args:
        results: a single or list of ``ultralytics.engine.results.Results``
        confidence_thresh (None): a confidence threshold to filter boxes
        tolerance (2): a tolerance, in pixels, when generating approximate
            polylines for instance masks. Typical values are 1-3 pixels
        filled (True): whether the polyline should be filled

    Returns:
        a single or list of :class:`fiftyone.core.labels.Polylines`
    """
    single = not isinstance(results, list)
    if single:
        results = [results]

    batch = [
        _to_polylines(
            r, tolerance, filled, confidence_thresh=confidence_thresh
        )
        for r in results
    ]

    if single:
        return batch[0]

    return batch


def _to_polylines(result, tolerance, filled, confidence_thresh=None):
    if result.masks is None:
        return None

    classes = np.rint(result.boxes.cls.detach().cpu().numpy()).astype(int)
    confs = result.boxes.conf.detach().cpu().numpy().astype(float)

    if tolerance > 1:
        masks = result.masks.data.detach().cpu().numpy() > 0.5
        points = itertools.repeat(None)
    else:
        masks = itertools.repeat(None)
        points = result.masks.xyn

    polylines = []
    for cls, mask, _points, conf in zip(classes, masks, points, confs):
        if confidence_thresh is not None and conf < confidence_thresh:
            continue

        if _points is None:
            _points = fol._get_polygons(mask, tolerance)
        else:
            _points = [_points.astype(float)]

        label = result.names[cls]

        polyline = fol.Polyline(
            label=label,
            points=_points,
            confidence=conf,
            closed=True,
            filled=filled,
        )
        polylines.append(polyline)

    return fol.Polylines(polylines=polylines)


def to_keypoints(results, confidence_thresh=None):
    """Converts ``ultralytics.YOLO`` keypoints to FiftyOne format.

    Args:
        results: a single or list of ``ultralytics.engine.results.Results``
        confidence_thresh (None): a confidence threshold to filter keypoints

    Returns:
        a single or list of :class:`fiftyone.core.labels.Keypoints`
    """
    single = not isinstance(results, list)
    if single:
        results = [results]

    batch = [
        _to_keypoints(r, confidence_thresh=confidence_thresh) for r in results
    ]

    if single:
        return batch[0]

    return batch


def _to_keypoints(result, confidence_thresh=None):
    if result.keypoints is None:
        return None

    classes = np.rint(result.boxes.cls.detach().cpu().numpy()).astype(int)
    points = result.keypoints.xyn.detach().cpu().numpy().astype(float)
    if result.keypoints.conf is not None:
        confs = result.keypoints.conf.detach().cpu().numpy().astype(float)
    else:
        confs = itertools.repeat(None)

    keypoints = []
    for cls, _points, _confs in zip(classes, points, confs):
        if confidence_thresh is not None:
            _points[_confs < confidence_thresh] = np.nan

        label = result.names[cls]
        _confidence = _confs.tolist() if _confs is not None else None

        keypoint = fol.Keypoint(
            label=label,
            points=_points.tolist(),
            confidence=_confidence,
        )
        keypoints.append(keypoint)

    return fol.Keypoints(keypoints=keypoints)


class UltralyticsOutputProcessor(fout.OutputProcessor):
    """Converts Ultralytics PyTorch Hub model outputs to FiftyOne format."""

    def __call__(self, result, frame_size, confidence_thresh=None):
        batch = []
        for df in result.pandas().xywhn:
            if confidence_thresh is not None:
                df = df[df["confidence"] >= confidence_thresh]

            batch.append(self._to_detections(df))

        return batch

    def _to_detections(self, df):
        return fol.Detections(
            detections=[
                fol.Detection(
                    label=row.name,
                    bounding_box=[
                        row.xcenter - 0.5 * row.width,
                        row.ycenter - 0.5 * row.height,
                        row.width,
                        row.height,
                    ],
                    confidence=row.confidence,
                )
                for row in df.itertuples()
            ]
        )


class FiftyOneYOLOModel(Model):
    """YOLO model wrapper for FiftyOne.

    Args:
        config: a dict which has the `ultralytics.YOLO` model as the value for
            the key `model`
    """

    def __init__(self, config):
        self.model = config.get("model", None)

    @property
    def media_type(self):
        return "image"

    @property
    def ragged_batches(self):
        return True

    @property
    def transforms(self):
        return None

    @property
    def preprocess(self):
        return False

    def predict(self, args):
        raise NotImplementedError("Subclass must implement `predict`")

    def predict_all(self, args):
        return self.predict(args)


class FiftyOneYOLODetectionModel(FiftyOneYOLOModel):
    """YOLO detection model wrapper for FiftyOne.

    Args:
        config: a dict which has the `ultralytics.YOLO` Detection model as the
            value for the key `model`
    """

    def predict(self, arg):
        image = Image.fromarray(arg)
        predictions = self.model(image, verbose=False)
        return to_detections(predictions[0])


class FiftyOneYOLOSegmentationModel(FiftyOneYOLOModel):
    """YOLO segmentation model wrapper for FiftyOne.

    Args:
        config: a dict which has the `ultralytics.YOLO` Segmentation model as
            the value for the key `model`
    """

    def predict(self, arg):
        image = Image.fromarray(arg)
        predictions = self.model(image, verbose=False)
        return to_instances(predictions[0])


class FiftyOneYOLOPoseModel(FiftyOneYOLOModel):
    """YOLO pose model wrapper for FiftyOne.

    Args:
        config: a dict which has the `ultralytics.YOLO` Pose model as the value
            for the key `model`
    """

    def predict(self, arg):
        image = Image.fromarray(arg)
        predictions = self.model(image, verbose=False)
        return to_keypoints(predictions[0])


def _convert_yolo_detection_model(model):
    config = {"model": model}
    return FiftyOneYOLODetectionModel(config)


def _convert_yolo_segmentation_model(model):
    config = {"model": model}
    return FiftyOneYOLOSegmentationModel(config)


def _convert_yolo_pose_model(model):
    config = {"model": model}
    return FiftyOneYOLOPoseModel(config)


def _convert_yolo_model(model):
    if isinstance(model.model, ultralytics.nn.tasks.SegmentationModel):
        return _convert_yolo_segmentation_model(model)
    elif isinstance(model.model, ultralytics.nn.tasks.PoseModel):
        return _convert_yolo_pose_model(model)
    elif isinstance(model.model, ultralytics.nn.tasks.DetectionModel):
        return _convert_yolo_detection_model(model)
    else:
        raise ValueError(
            "Unsupported model type. Cannot convert to a FiftyOne,"
            ":class:`Model`."
        )
