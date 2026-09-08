// CRM/src/components/shared/PdiImageUpload.jsx
import { useState, useRef, useCallback } from 'react';
import Modal from 'react-modal';
import Cropper from 'react-easy-crop';
import { Image as ImageIcon, X, Camera } from 'lucide-react';
import { useNotify } from '../../hooks/useNotify';
import { CROP_ASPECT, cropAndCompress } from '../../utils/pdiImageUpload';

Modal.setAppElement('#root');

export function ImageUploadCard({ label, hint, value, onSelect, onClear, heightCls = 'h-40' }) {
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);
  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>}
      {hint && <p className="text-xs text-gray-400 mb-1.5">{hint}</p>}
      <div className={`relative rounded-lg border-2 border-dashed bg-gray-50 ${heightCls} flex items-center justify-center overflow-hidden ${value ? 'border-gray-200' : 'border-gray-300'}`}>
        {value ? (
          <>
            <img src={value} alt={label || 'Uploaded'} className="max-h-full max-w-full object-contain" />
            <button
              type="button"
              onClick={onClear}
              className="absolute top-1.5 right-1.5 p-1 bg-white/90 rounded-full shadow hover:bg-white text-gray-600 hover:text-red-500"
              title="Remove image"
            >
              <X size={14} />
            </button>
          </>
        ) : (
          <div className="flex items-center gap-5 text-gray-400">
            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center gap-1.5 hover:text-amber-500 transition-colors"
            >
              <Camera size={26} />
              <span className="text-xs font-medium">Take Photo</span>
            </button>
            <div className="w-px h-9 bg-gray-200" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-1.5 hover:text-amber-500 transition-colors"
            >
              <ImageIcon size={26} />
              <span className="text-xs font-medium">Choose File</span>
            </button>
          </div>
        )}
      </div>
      {/* capture="environment" opens the device camera directly — needed because
          Android's system Photo Picker (the default gallery chooser) has no camera
          shortcut of its own, by design (it's a privacy-scoped media picker). */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onSelect(e.target.files?.[0], e.target)}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onSelect(e.target.files?.[0], e.target)}
      />
    </div>
  );
}

// Drag-to-crop + pinch-zoom overlay shown after a file is picked, before it's
// attached to the form. Crops to CROP_ASPECT then hands the result to onApply
// as a compressed JPEG data URI (see cropAndCompress).
export function CropModal({ imageSrc, onCancel, onApply }) {
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [busy, setBusy] = useState(false);
  const { notifyError } = useNotify();

  const handleCropComplete = useCallback((_area, pixels) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const handleApply = async () => {
    if (!croppedAreaPixels) return;
    setBusy(true);
    try {
      const dataUri = await cropAndCompress(imageSrc, croppedAreaPixels);
      onApply(dataUri);
    } catch {
      notifyError('Failed to process image. Please try a different photo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      isOpen
      onRequestClose={onCancel}
      overlayClassName="fixed inset-0 bg-gray-900 bg-opacity-70 flex items-center justify-center z-[60] p-4"
      className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-auto outline-none"
      contentLabel="Crop Image"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
        <h3 className="text-base font-semibold text-gray-800">Adjust photo</h3>
        <button type="button" onClick={onCancel} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
      </div>
      <div className="relative bg-gray-900" style={{ height: 320 }}>
        <Cropper
          image={imageSrc}
          crop={crop}
          zoom={zoom}
          aspect={CROP_ASPECT}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={handleCropComplete}
        />
      </div>
      <div className="px-5 py-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">Zoom</label>
          <input
            type="range"
            min={1}
            max={3}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className="w-full"
          />
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-100 text-sm">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleApply}
            disabled={busy || !croppedAreaPixels}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 text-sm font-semibold"
          >
            {busy ? 'Processing...' : 'Apply'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
