import type { Bounds, ReconstructionQuality } from '../opencv/types';

export type QualityAssessmentInput = {
  imageWidth: number;
  imageHeight: number;
  bounds: Bounds | null | undefined;
  personArea: number;
  secondBlobArea: number;
  /** True when the only outline would be a synthetic stand-in, not the photo. */
  usedFallback: boolean;
  method: ReconstructionQuality['method'];
};

const NO_PERSON =
  "We couldn't find a person in this photo. Use a full-body, front-facing photo with one person on a plain background.";
const TOO_SMALL =
  'The person is too small in the frame. Step closer and keep your whole body in the photo.';
const SYNTHETIC =
  "We couldn't trace a real outline from this photo. Try a full-body, front-facing photo on a plain background.";
const FULL_BODY = 'Use a full-body, front-facing photo with the whole body in frame.';
const CROPPED =
  'You may be cut off at the top or bottom. Leave a little space above your head and below your feet.';
const MULTIPLE =
  'More than one person may be in this photo. Use a photo with only one person.';

/**
 * User-facing reconstruction quality. Never throws — a bad photo is a failed
 * result the caller can refuse to save.
 */
export function assessQuality(input: QualityAssessmentInput): ReconstructionQuality {
  const method = input.method;
  const bounds = usableBounds(input.bounds) ? input.bounds : null;
  const imageOk =
    Number.isFinite(input.imageWidth) &&
    Number.isFinite(input.imageHeight) &&
    input.imageWidth > 0 &&
    input.imageHeight > 0;
  const imageArea = imageOk ? input.imageWidth * input.imageHeight : 0;
  const personArea = Number.isFinite(input.personArea) && input.personArea > 0 ? input.personArea : 0;
  const tooSmall = !imageOk || personArea < 0.02 * imageArea;
  const synthetic = input.usedFallback === true;

  if (!bounds || tooSmall || synthetic) {
    const messages: string[] = [];
    if (!bounds) messages.push(NO_PERSON);
    else if (tooSmall) messages.push(TOO_SMALL);
    else messages.push(SYNTHETIC);
    return { status: 'failed', messages, usedFallback: true, method };
  }

  const messages: string[] = [];
  if (bounds.height < input.imageHeight * 0.55) messages.push(FULL_BODY);
  const bottom = bounds.y + bounds.height;
  if (bounds.y <= 2 || bottom >= input.imageHeight - 2) messages.push(CROPPED);
  const second =
    Number.isFinite(input.secondBlobArea) && input.secondBlobArea > 0 ? input.secondBlobArea : 0;
  if (second > 0.35 * personArea) messages.push(MULTIPLE);

  return {
    status: messages.length > 0 ? 'low' : 'ok',
    messages,
    usedFallback: false,
    method,
  };
}

function usableBounds(bounds: Bounds | null | undefined): bounds is Bounds {
  if (!bounds) return false;
  return (
    Number.isFinite(bounds.x) &&
    Number.isFinite(bounds.y) &&
    Number.isFinite(bounds.width) &&
    Number.isFinite(bounds.height) &&
    bounds.width > 0 &&
    bounds.height > 0
  );
}
