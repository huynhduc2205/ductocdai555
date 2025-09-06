
import React, { useEffect, useState } from 'react';
import { DownloadIcon, XMarkIcon } from './Icons';
import Spinner from './Spinner';
import { upscaleToTarget, FitMode } from '../utils/upscale';
import { downloadCanvas } from '../utils/download';


interface ImageModalProps {
  imageUrl: string;
  displayText: string;
  onClose: () => void;
  show: boolean;
}

const ImageModal: React.FC<ImageModalProps> = ({ imageUrl, displayText, onClose, show }) => {
  const [downloadSize, setDownloadSize] = useState<'api' | '2k' | '4k'>('4k');
  const [fitMode, setFitMode] = useState<FitMode>('fit');
  const [downloadFormat, setDownloadFormat] = useState<'jpg' | 'png'>('jpg');
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const handleAdvancedDownload = async () => {
      setIsDownloading(true);
      try {
        const response = await fetch(imageUrl);
        const blob = await response.blob();

        if (downloadSize === 'api') {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const extension = blob.type.split('/')[1] || 'png';
            a.download = `ductocdai-ai_original.${extension}`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            return;
        }

        const targetLongEdge = downloadSize === '2k' ? 2048 : 3840;
        const canvas = await upscaleToTarget(blob, {
            targetLongEdge,
            fit: fitMode,
            bg: 'average',
        });
        await downloadCanvas(canvas, {
            format: downloadFormat,
            basename: 'ductocdai-ai',
            quality: downloadFormat === 'jpg' ? 0.95 : undefined,
        });

      } catch (error) {
        console.error('Download failed:', error);
        alert('Tải ảnh thất bại. Vui lòng thử lại.');
      } finally {
        setIsDownloading(false);
      }
  };


  if (!show) {
    return null;
  }

  return (
    <div 
      className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 transition-opacity duration-300 animate-fadeIn"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="image-modal-title"
    >
      <div 
        className="relative w-full max-w-4xl max-h-[90vh] bg-slate-900 rounded-lg shadow-2xl overflow-hidden animate-scaleUp"
        onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside the modal content
      >
        <div className="relative w-full h-full flex items-center justify-center">
            <img 
              src={imageUrl} 
              alt="Generated image preview" 
              className="max-w-full max-h-[90vh] object-contain"
            />
            {/* Text overlay similar to the grid item */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 flex flex-col justify-end">
                <p id="image-modal-title" className="text-white font-bold text-center text-sm sm:text-base drop-shadow-lg" style={{textShadow: '2px 2px 4px #000'}}>{displayText}</p>
            </div>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-2 bg-black/50 text-white rounded-full hover:bg-black/80 focus:outline-none focus:ring-2 focus:ring-white transition-colors"
          aria-label="Close image viewer"
        >
          <XMarkIcon className="w-6 h-6" />
        </button>

        {/* Download Panel */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-[90%] max-w-lg bg-black/60 backdrop-blur-md rounded-lg p-4 border border-white/10 shadow-lg">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-white">
            {/* Resolution */}
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-yellow-300 text-center sm:text-left">Độ phân giải</h4>
              <div className="flex justify-around sm:flex-col gap-2 text-sm">
                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="dl-size" value="api" checked={downloadSize === 'api'} onChange={() => setDownloadSize('api')} className="accent-yellow-400" /> Gốc</label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="dl-size" value="2k" checked={downloadSize === '2k'} onChange={() => setDownloadSize('2k')} className="accent-yellow-400" /> 2K</label>
                <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="dl-size" value="4k" checked={downloadSize === '4k'} onChange={() => setDownloadSize('4k')} className="accent-yellow-400" /> 4K</label>
              </div>
            </div>
            
            {/* Framing & Format */}
            <div className="space-y-2">
              <h4 className="text-sm font-bold text-yellow-300 text-center sm:text-left">Tùy chọn</h4>
              <div className="flex flex-col gap-2 text-sm">
                 <select value={fitMode} onChange={e => setFitMode(e.target.value as FitMode)} className="bg-slate-800 border border-slate-600 rounded-md p-1.5 text-xs focus:ring-yellow-400 focus:border-yellow-400 disabled:opacity-50" disabled={downloadSize === 'api'}>
                    <option value="fit">Căn khung: Fit (không cắt)</option>
                    <option value="fill">Căn khung: Fill (có thể cắt)</option>
                    <option value="smart">Căn khung: Smart Crop</option>
                 </select>
                 <div className="flex justify-around gap-2 pt-2">
                    <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="dl-format" value="jpg" checked={downloadFormat === 'jpg'} onChange={() => setDownloadFormat('jpg')} className="accent-yellow-400" /> JPG</label>
                    <label className="flex items-center gap-2 cursor-pointer"><input type="radio" name="dl-format" value="png" checked={downloadFormat === 'png'} onChange={() => setDownloadFormat('png')} className="accent-yellow-400" /> PNG</label>
                 </div>
              </div>
            </div>

            {/* Download Button */}
            <div className="flex flex-col justify-center items-center">
                <button
                    onClick={handleAdvancedDownload}
                    disabled={isDownloading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-yellow-500 text-slate-900 font-bold rounded-full hover:bg-yellow-400 transform hover:scale-105 transition-all shadow-lg disabled:bg-slate-500 disabled:scale-100 disabled:cursor-wait"
                    aria-label="Download image"
                >
                    {isDownloading ? <Spinner size="sm" /> : <DownloadIcon className="w-5 h-5" />}
                    {isDownloading ? 'Đang xử lý...' : 'Tải ảnh'}
                </button>
                <p className="text-xs text-slate-400 mt-2 text-center">Mẹo: 2K/4K sẽ upscale nếu cần.</p>
            </div>
          </div>
        </div>
      </div>
       <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scaleUp {
          from { transform: scale(0.95); opacity: 0; }
          to { opacity: 1; }
        }
        .animate-fadeIn { animation: fadeIn 0.2s ease-out forwards; }
        .animate-scaleUp { animation: scaleUp 0.2s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default ImageModal;
