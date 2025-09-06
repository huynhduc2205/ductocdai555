
import React, { useState, useCallback, useRef, useMemo } from 'react';
import { editImage } from './services/geminiService';
import Spinner from './components/Spinner';
import ImageModal from './components/ImageModal';
import { THEME_DATA, CREATIVE_EFFECTS_DATA, ACCESSORIES_DATA } from './data/themes';
import { UploadIcon, PhotoIcon, ExclamationTriangleIcon, SparklesIcon, DownloadIcon, TrashIcon, ArrowPathIcon, UsersIcon, ReferenceIcon, InformationCircleIcon } from './components/Icons';
import { pLimit } from './pLimit';

type Mode = 'wedding' | 'street' | 'restore' | 'reference';
type SubjectMode = 'single' | 'couple';
type CreativeEffect = { name: string; influence: number };
type Accessory = { name: string; influence: number };

const ASPECT_RATIOS = {
    'Giữ tỉ lệ gốc': 'original',
    '1:1': '1:1',
    '4:5': '4:5',
    '3:4': '3:4',
    '2:3': '2:3',
    '16:9': '16:9',
    '9:16': '9:16',
    '5:4': '5:4',
    '3:2': '3:2',
};

const RESOLUTIONS_BY_ASPECT: Record<string, string[]> = {
    '1:1': ['1024x1024', '1536x1536', '2048x2048'],
    '4:5': ['1080x1350', '2048x2560'],
    '3:4': ['1080x1440', '1536x2048'],
    '2:3': ['1200x1800', '1600x2400'],
    '16:9': ['1920x1080', '2560x1440'],
    '9:16': ['1080x1920', '1440x2560'],
    '5:4': ['2000x1600'],
    '3:2': ['1800x1200', '2400x1600'],
};

const GLITCH_EFFECTS = ["Hiệu ứng Glitch nghệ thuật", "Hiệu ứng TV nhiễu (VHS static)"];

const buildWeddingPrompt = ({ 
    theme, 
    subjectMode, 
    isWeddingActive, 
    retouchLevel, 
    tone, 
    bgType, 
    accessories, 
    additionalNotes, 
    creativeEffects, 
    noBackgroundChange, 
    backgroundBrightness, 
    backgroundBlur, 
    grainAmount 
}: { 
    theme: string; 
    subjectMode: SubjectMode; 
    isWeddingActive: boolean; 
    retouchLevel: 'light' | 'medium' | 'pro'; 
    tone: 'warm' | 'neutral' | 'cool'; 
    bgType: 'studio' | 'outdoor'; 
    accessories: Accessory[]; 
    additionalNotes: string; 
    creativeEffects: CreativeEffect[]; 
    noBackgroundChange: boolean; 
    backgroundBrightness: number; 
    backgroundBlur: number; 
    grainAmount: number; 
}): string => {

    const isCouple = subjectMode === 'couple';

    // --- CORE RULES (ABSOLUTE PRIORITY) ---
    const coreRules = [
        isCouple
            ? "CORE RULE #1: The final image MUST contain EXACTLY TWO people. A single-person image is an invalid result. Do not remove or crop out either person."
            : "CORE RULE #1: The final image MUST contain EXACTLY ONE person. Do not add or duplicate people.",
        "CORE RULE #2: You MUST preserve the original faces, identities, and body proportions from the source photo 100%. Do not perform a face-swap, gender-swap, or morph the subjects."
    ].join(' ');

    // --- COMPOSITION & ROLES ---
    let compositionAndRoles = "";
    if (isWeddingActive) {
        compositionAndRoles = isCouple
            ? "COMPOSITION: The person on the LEFT is the Bride (wearing an elegant white wedding dress). The person on the RIGHT is the Groom (wearing a sharp tuxedo/suit). Both heads and shoulders must be fully visible. Use a half-body or full-body shot that comfortably frames both subjects."
            : "COMPOSITION: Apply bridal or groom styling to the single subject based on their appearance in the source photo, without changing their identity.";
    } else {
        compositionAndRoles = isCouple
            ? "COMPOSITION: Enhance the original clothing of both people. Both heads and shoulders must be fully visible. Use a half-body or full-body shot that comfortably frames both subjects."
            : "COMPOSITION: Enhance the original clothing of the single subject.";
    }

    // --- SCENE & STYLE ---
    const scene = noBackgroundChange
        ? "BACKGROUND: Keep the original background and clothing. Only apply lighting, color, and creative effects."
        : `BACKGROUND: Create a new background based on the theme '${theme}' and context '${bgType}'.`;
        
    const retouchMapping = { light: "light skin retouch, keep texture", medium: "natural smooth skin retouch", pro: "pro-level skin retouch with dodge & burn" };
    const styleSettings = [
        `RETOUCH: ${retouchMapping[retouchLevel]}.`,
        accessories.length > 0 ? `ACCESSORIES: Add ${accessories.map(a => `${a.name} (influence ${a.influence}%)`).join(', ')}.` : '',
        creativeEffects.length > 0 ? `CREATIVE EFFECTS: Apply ${creativeEffects.map(e => `"${e.name}" (influence ${e.influence}%)`).join(', ')}.` : '',
        `FINE-TUNE: Color tone: ${tone}. Background brightness: ${backgroundBrightness}%. Background blur: ${backgroundBlur}%. ${grainAmount > 0 ? `Film grain: ${grainAmount}%.` : ''}`,
        additionalNotes ? `USER NOTES: ${additionalNotes}` : ''
    ].filter(Boolean).join(' ');

    // --- QUALITY & OUTPUT ---
    const quality = "OUTPUT: Generate an ultra-high resolution 4K, realistic photo with crisp details, as a lossless PNG.";

    // --- NEGATIVE PROMPT ---
    const hasGlitchEffect = creativeEffects.some(e => GLITCH_EFFECTS.includes(e.name));
    const negativeParts = [
        isCouple ? "single person, solo portrait, cropping one person out, only one person visible" : "more than one person, extra person, duplicated person",
        "face duplication, removing existing people, face-swap, gender-swap, incorrect role assignment",
        "deformed face, plastic skin, bad anatomy, extra limbs, incorrect fingers",
        "cartoon, anime, 3D, text, logo, watermark",
    ];
    if (!isWeddingActive) {
        negativeParts.push("wedding dress, veil, tuxedo, bridal bouquet");
    }
    if (!hasGlitchEffect) {
        negativeParts.push("glitch, TV static, scanlines");
    }
    const negative = `NEGATIVE PROMPT (DO NOT GENERATE): ${negativeParts.join(', ')}.`;

    // --- FINAL ASSEMBLY ---
    return [
        coreRules,
        compositionAndRoles,
        scene,
        styleSettings,
        quality,
        negative
    ].filter(Boolean).join(' ');
};

const buildStreetPrompt = ({ theme, aspect, additionalNotes, grainAmount }: { theme: string; aspect: '3:2' | '4:5'; additionalNotes: string; grainAmount: number; }): string => {
    const basePrompt = `Chỉnh ảnh chân dung theo phong cách STREET GRITTY bụi bặm, nhưng giữ nguyên 100% gương mặt gốc, không đổi giới tính, không morph. CHỈ MỘT NGƯỜI DUY NHẤT. Người Việt, giữ nguyên gương mặt và vóc dáng hiện có trong ảnh. Tư thế tự nhiên, có thể đứng tựa tường hoặc thẳng người, biểu cảm “cool”. Trang phục là áo khoác denim/da, áo thun tối màu, quần jeans, giày sneaker/boot.`;
    const qualityPrompt = "CRITICAL INSTRUCTION: Generate the image at ultra-high 4K resolution and quality. Ensure maximum detail, sharp focus, and no compression artifacts. The final output file MUST be a lossless PNG. Giữ lại toàn bộ chi tiết và texture da từ ảnh gốc.";
    const negativePrompt = `NEGATIVE PROMPT: Không thêm chữ/logo ngẫu nhiên, không hoạt hình/anime/3D, không HDR gắt, không méo mặt/ngón tay dư, không đổi giới tính, không phông quá rối, không làm biến dạng hoặc thay đổi gương mặt, giữ texture da tự nhiên, không plastic, KHÔNG DÙNG: hiệu ứng glitch, nhiễu TV, sọc scanline.`;
    const grainPrompt = grainAmount > 0 ? `Thêm hiệu ứng film grain với cường độ ${grainAmount}%.` : '';

    const themePrompts: { [key: string]: string } = {
      "Hẻm mưa – Neon phản chiếu": "Bối cảnh: hẻm Sài Gòn đêm mưa, mặt đường ướt như gương, phản chiếu biển neon xanh/cyan và hồng/magenta. Mood: cinematic, hơi lạnh + chút cam từ sodium, desaturate nhẹ, grain medium, vignette nhẹ. Pose: đứng tựa tường gạch, nhìn lệch camera, tay trong túi áo khoác denim. Lens: 35mm, DOF vừa, rim light từ biển neon phía sau.",
      "Dưới cầu vượt – Khói bụi & sodium": "Bối cảnh: dưới cầu vượt bê tông, đèn đường sodium vàng cam, khói/bụi mỏng. Mood: ấm + bụi bặm, contrast vừa, flare nhẹ, bề mặt asphalt có loang ẩm. Pose: bước chậm qua khung, bóng đổ dài, góc chụp hơi thấp. Lens: 35mm/50mm, backlight + fill nhẹ phía trước.",
      "Rooftop lúc hoàng hôn": "Bối cảnh: sân thượng (rooftop) nhìn xuống đô thị, biển hiệu xa xa, gió nhẹ. Mood: golden hour chuyển sang xanh tím, desaturate nhẹ, grain tinh tế. Pose: đứng cạnh lan can, gió hất áo khoác, nhìn xa horizonte. Lens: 50mm, DOF vừa, rim mảnh quanh tóc và vai.",
      "Ga tàu/bến xe cũ – Film vibe": "Bối cảnh: ga tàu/bến xe cũ, bảng giờ mờ, vài bóng đèn tuýp cũ. Mood: film-like, hơi xanh lá/teal + vàng, grain medium, chút bụi trong không khí. Pose: ngồi trên ghế băng kim loại, cúi nhẹ, ánh mắt nghiêm. Lens: 50mm, ánh sáng trên cao, bóng đổ mềm.",
      "Xưởng bỏ hoang – Ánh xiên mạnh": "Bối cảnh: nhà kho/xưởng bỏ hoang, tường sơn bong, vệt nắng xiên qua cửa sổ vỡ. Mood: moody, contrast rõ nhưng không gắt, hạt bụi bay trong tia nắng. Pose: đứng giữa vệt sáng, silhouette rõ viền, mặt vẫn sáng đủ thấy chi tiết. Lens: 35mm, rim mạnh phía sau + fill nhẹ phía trước."
    };
    
    const selectedThemePrompt = themePrompts[theme as keyof typeof themePrompts] || theme;
    const outputPrompt = `OUTPUT: 4K, aspect ${aspect}.`;

    return `${basePrompt} SCENE & STYLE: ${selectedThemePrompt} ${outputPrompt} ${additionalNotes} ${grainPrompt} ${qualityPrompt} ${negativePrompt}`;
};

const buildRestorePrompt = ({ theme, additionalNotes }: { theme: string; additionalNotes: string; }): string => {
    const basePrompt = `GOAL: Restore an old or damaged photo, keeping the ORIGINAL face and identity 100% unchanged (no morph, no beautify). STEPS: Remove scratches, stains, dust, fold lines. Balance brightness/contrast, recover lost details, de-noise nhẹ (vẫn giữ grain film). Preserve age markers: nếp nhăn, nốt ruồi, sẹo nhỏ. If B&W → colorize naturally based on the era; if color is yellowed → correct the color cast back to original. STYLE: Maintain the vintage vibe, don't make it look modern. Realistic lighting, natural skin tones, keep clothing and background the same.`;
    const qualityPrompt = "CRITICAL INSTRUCTION: Generate the image at the highest possible resolution and quality (4K minimum). Ensure maximum detail, sharp focus, and no compression artifacts. The final output file MUST be a lossless PNG. Preserve the original aspect ratio.";
    const negativePrompt = `NEGATIVE PROMPT: Don't de-age, don't change the face, no cartoon/anime/3D. Don't over-sharpen, no harsh HDR, no extra text or watermarks, no glitch, no scanlines.`;

    const themePrompts: { [key: string]: string } = {
        "Phục hồi nhẹ (xoá xước, cân sáng)": "Perform a light restoration: remove minor scratches and dust, balance brightness and contrast, keep the original film grain, do not change the original color if it exists.",
        "Phục hồi mạnh (vá rách, tái tạo chi tiết)": "Perform a heavy restoration: fix major tears and missing parts, intelligently reconstruct details in hair and clothing, apply moderate sharpening, while strictly keeping the original face.",
        "Tô màu tự nhiên (cho ảnh đen trắng)": "Perform authentic colorization on a black and white photo: use natural, era-appropriate Asian skin tones, black/brown hair, and muted, vintage colors for clothing and background. Avoid overly saturated colors.",
        "Khử màu ố vàng (cân bằng lại màu)": "Neutralize the yellow cast: restore the image to its original neutral colors, recovering true whites and blacks while maintaining a classic, vintage mood.",
        "Nâng cấp & làm nét 3x (để in ấn)": "Upscale the image by 3x and apply sophisticated sharpening: preserve skin and fabric textures, avoid halo artifacts, ensure the output is sharp enough for large format printing.",
    };
    
    const selectedThemePrompt = themePrompts[theme as keyof typeof themePrompts] || theme;

    return `${basePrompt} TASK: ${selectedThemePrompt}. ${additionalNotes} ${qualityPrompt} ${negativePrompt}`;
};

const buildReferencePrompt = ({ theme, influence, tone, sharpness, bgType, aspect, outputK, additionalNotes, creativeEffects, grainAmount }: { theme: string; influence: number; tone: 'warm' | 'neutral' | 'cool'; sharpness: 'light' | 'medium' | 'pro'; bgType: 'studio' | 'outdoor'; aspect: '2:3' | '3:2' | '4:5'; outputK: 2 | 4; additionalNotes: string; creativeEffects: CreativeEffect[]; grainAmount: number; }): string => {
    const basePrompt = `You are given two images. Image 1 is the user's source photo. Image 2 is the reference photo. GOAL: Recreate the user's source photo (Image 1) by applying the artistic style from the reference photo (Image 2). KEY RULE: The face, identity, body shape, and original clothing of the person in the source photo MUST be preserved 100%. DO NOT morph, swap, or alter the person's identity. Only transfer the style.`;
    const styleTransferPrompt = `Analyze the reference image (Image 2) for its overall style: color grading, lighting scheme, mood, composition, and texture. Apply this exact style to the user's source photo (Image 1).`;
    const influencePrompt = `The style influence from the reference image should be at ${influence}%. A lower value means the source photo is less altered; a higher value means it more closely mimics the reference style.`;
    const themePrompt = `The desired final theme is "${theme}". Use this theme to guide the style transfer if there are ambiguities.`;
    
    const creativeEffectsPrompt = creativeEffects.length > 0
      ? `After applying the base style, also layer in these creative effects: ${creativeEffects.map(e => `"${e.name}" with an influence of ${e.influence}%`).join(', ')}.`
      : '';

    const sharpnessMapping = {
        light: "nhẹ",
        medium: "vừa",
        pro: "kỹ",
    };
    
    const qualityPrompt = `CRITICAL INSTRUCTION: Generate the image at the specified resolution (${outputK === 2 ? '2K' : '4K'}) and highest possible quality. Ensure maximum detail, sharp focus, and no compression artifacts. The final output file MUST be a lossless PNG.`;
    const settingsPrompt = `Additional settings: Tone: ${tone}. Sharpness: ${sharpnessMapping[sharpness]}. Background context: ${bgType}. Aspect ratio: ${aspect}. ${grainAmount > 0 ? `Add film grain at ${grainAmount}% intensity.` : ''}`;
    const userNotes = additionalNotes ? `User notes: ${additionalNotes}` : '';
    
    const hasGlitchEffect = creativeEffects.some(e => GLITCH_EFFECTS.includes(e.name));
    const negativeParts = [
        "DO NOT change the person's face or identity. No morphing, no face swap.",
        "No cartoon/anime/3D. No harsh HDR. Do not add random text or logos.",
        "Ensure anatomy is correct. No plastic skin.",
    ];
     if (!hasGlitchEffect) {
        negativeParts.push("KHÔNG DÙNG: hiệu ứng glitch, nhiễu TV, sọc scanline.");
    }
    const negativePrompt = `NEGATIVE PROMPT: ${negativeParts.join(', ')}.`;
    
    return `${basePrompt} ${styleTransferPrompt} ${influencePrompt} ${themePrompt} ${creativeEffectsPrompt} ${settingsPrompt} ${userNotes} ${qualityPrompt} ${negativePrompt}`;
};

const ContactLinks: React.FC = () => {
  return (
    <div className="fixed top-4 right-4 z-50">
      <div className="relative rounded-2xl border border-white/15 bg-black/40 backdrop-blur-md shadow-xl">
        {/* viền gradient mảnh tạo cảm giác cao cấp */}
        <div className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-white/10" />
        <div className="p-3 sm:p-4 min-w-[240px]">
          <div className="mb-2 flex items-center gap-2">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-yellow-400" />
            <p className="text-[11px] sm:text-xs uppercase tracking-widest text-yellow-300 font-bold">
              Liên hệ
            </p>
          </div>

          <div className="space-y-2">
            {/* Link 1: Hướng dẫn */}
            <a
              href="https://www.facebook.com/huynhuc.544199/"
              target="_blank" rel="noopener"
              className="group flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-100 hover:bg-white/10 hover:border-yellow-300/40 transition-colors"
              aria-label="LH: Hướng dẫn"
              title="LH: Hướng dẫn"
            >
              <div className="flex items-center gap-2">
                {/* icon nhỏ */}
                <svg viewBox="0 0 24 24" className="h-4 w-4 opacity-80 group-hover:opacity-100">
                  <path fill="currentColor" d="M12 2a10 10 0 1 0 .001 20.001A10 10 0 0 0 12 2Zm1 14h-2v-2h2v2Zm0-4h-2V6h2v6Z"/>
                </svg>
                <span className="text-sm font-medium">LH: Hướng dẫn</span>
              </div>
              {/* external arrow */}
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-yellow-300 opacity-80 group-hover:translate-x-0.5 transition">
                <path fill="currentColor" d="M14 3h7v7h-2V6.414l-9.293 9.293-1.414-1.414L17.586 5H14V3Z"/>
                <path fill="currentColor" d="M5 5h6v2H7v10h10v-4h2v6H5V5Z"/>
              </svg>
            </a>

            {/* Link 2: Chụp ảnh cưới tại STUDIO */}
            <a
              href="https://www.facebook.com/thanh.huan.738690"
              target="_blank" rel="noopener"
              className="group flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-slate-100 hover:bg-white/10 hover:border-yellow-300/40 transition-colors"
              aria-label="LH: Chụp ảnh cưới tại STUDIO"
              title="LH: Chụp ảnh cưới tại STUDIO"
            >
              <div className="flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="h-4 w-4 opacity-80 group-hover:opacity-100">
                  <path fill="currentColor" d="M9 3h6l1.5 2H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2-2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h3L9 3Zm3 14a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/>
                </svg>
                <span className="text-sm font-medium">LH: Chụp ảnh cưới tại STUDIO</span>
              </div>
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-yellow-300 opacity-80 group-hover:translate-x-0.5 transition">
                <path fill="currentColor" d="M14 3h7v7h-2V6.414l-9.293 9.293-1.414-1.414L17.586 5H14V3Z"/>
                <path fill="currentColor" d="M5 5h6v2H7v10h10v-4h2v6H5V5Z"/>
              </svg>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};


const App: React.FC = () => {
  // Common State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedImages, setGeneratedImages] = useState<{src: string, description: string}[]>([]);
  const [selectedThemes, setSelectedThemes] = useState<string[]>([]);
  const [selectedCreativeEffects, setSelectedCreativeEffects] = useState<CreativeEffect[]>([]);
  const [additionalNotes, setAdditionalNotes] = useState('');
  const [modalImage, setModalImage] = useState<{src: string, description: string} | null>(null);
  const [debugPrompt, setDebugPrompt] = useState('');
  
  // Mode State
  const [currentMode, setCurrentMode] = useState<Mode>('wedding');

  // Image State
  const [originalImage, setOriginalImage] = useState<{ file: File; dataUrl: string; width: number; height: number; } | null>(null);
  const [referenceImage, setReferenceImage] = useState<{ file: File; dataUrl: string } | null>(null);
  const originalImageInputRef = useRef<HTMLInputElement>(null);
  const referenceInputRef = useRef<HTMLInputElement>(null);

  // Common State (refactored for wedding)
  const [variations, setVariations] = useState(4);
  const [tone, setTone] = useState<'warm'|'neutral'|'cool'>('neutral');
  const [bgType, setBgType] = useState<'studio'|'outdoor'>('studio');
  const [grainAmount, setGrainAmount] = useState(0);
  
  // Wedding-only State
  const [subjectMode, setSubjectMode] = useState<SubjectMode>('single');
  const [isWeddingActive, setIsWeddingActive] = useState(false);
  const [retouchLevel, setRetouchLevel] = useState<'light'|'medium'|'pro'>('medium');
  const [accessories, setAccessories] = useState<Accessory[]>([]);
  const [noBackgroundChange, setNoBackgroundChange] = useState(false);
  const [backgroundBrightness, setBackgroundBrightness] = useState(50);
  const [backgroundBlur, setBackgroundBlur] = useState(20);
  
  // New Wedding Size & Aspect Ratio State
  const [weddingAspectRatio, setWeddingAspectRatio] = useState<string>('original');
  const [weddingResolution, setWeddingResolution] = useState<string>('');
  const [weddingCropMethod, setWeddingCropMethod] = useState<'fit' | 'fill'>('fill');
  const [weddingFitBackground, setWeddingFitBackground] = useState<string>('blur');
  const [sharpenAfter, setSharpenAfter] = useState(false);

  // Street-only State
  const [streetAspect, setStreetAspect] = useState<'3:2' | '4:5'>('4:5');
  
  // Reference-only State
  const [influence, setInfluence] = useState(50);
  const [sharpness, setSharpness] = useState<'light'|'medium'|'pro'>('medium');
  const [refAspect, setRefAspect] = useState<'2:3' | '3:2' | '4:5'>('2:3');
  const [outputK, setOutputK] = useState<2 | 4>(4);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>, target: 'original' | 'reference') => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const img = new Image();
        img.onload = () => {
           const imageData = { file, dataUrl, width: img.width, height: img.height };
            if (target === 'original') {
                setOriginalImage(imageData);
            } else {
                setReferenceImage({ file, dataUrl });
            }
            setGeneratedImages([]);
            setError(null);
        };
        img.src = dataUrl;
      };
      reader.onerror = () => setError("Không thể đọc tệp ảnh. Vui lòng thử lại.");
      reader.readAsDataURL(file);
    }
  };
  
  const handleThemeToggle = (theme: string) => {
    if (theme === "Không thay đổi") {
        const isTurningOn = !noBackgroundChange;
        setNoBackgroundChange(isTurningOn);
        if (isTurningOn) {
            setSelectedThemes([]); // Clear other themes
        }
        return;
    }

    setSelectedThemes(prev => {
      const isSelected = prev.includes(theme);
      if (isSelected) {
        return prev.filter(t => t !== theme);
      } else if (prev.length < 6) {
        setNoBackgroundChange(false); // Turn off special chip
        return [...prev, theme];
      }
      return prev;
    });
  };

  const handleCreativeEffectToggle = (effectName: string) => {
    setSelectedCreativeEffects(prev => {
      const isSelected = prev.some(e => e.name === effectName);
      if (isSelected) {
        return prev.filter(e => e.name !== effectName);
      } else {
        return [...prev, { name: effectName, influence: 60 }];
      }
    });
  };
  
  const handleCreativeEffectInfluenceChange = (effectName: string, newInfluence: number) => {
    setSelectedCreativeEffects(prev => prev.map(e => e.name === effectName ? { ...e, influence: newInfluence } : e));
  };
  
    const handleAccessoryToggle = (accName: string) => {
        setAccessories(prev => {
            const isSelected = prev.some(a => a.name === accName);
            if (isSelected) {
                return prev.filter(a => a.name !== accName);
            } else {
                return [...prev, { name: accName, influence: 50 }];
            }
        });
    };

    const handleAccessoryInfluenceChange = (accName: string, newInfluence: number) => {
        setAccessories(prev => prev.map(a => a.name === accName ? { ...a, influence: newInfluence } : a));
    };
  
    const preprocessImage = async (image: { file: File; dataUrl: string; width: number; height: number; }): Promise<{ file: File; dataUrl: string }> => {
        return new Promise((resolve) => {
            if (weddingAspectRatio === 'original' && !sharpenAfter) {
                resolve({ file: image.file, dataUrl: image.dataUrl });
                return;
            }

            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d')!;

                let targetWidth, targetHeight;

                if (weddingAspectRatio === 'original') {
                    targetWidth = img.width;
                    targetHeight = img.height;
                } else {
                    [targetWidth, targetHeight] = weddingResolution.split('x').map(Number);
                }

                canvas.width = targetWidth;
                canvas.height = targetHeight;

                const sourceAspect = img.width / img.height;
                const targetAspect = targetWidth / targetHeight;
                let sx = 0, sy = 0, sWidth = img.width, sHeight = img.height;

                if (weddingCropMethod === 'fill') {
                    if (sourceAspect > targetAspect) { // source is wider
                        sWidth = img.height * targetAspect;
                        sx = (img.width - sWidth) / 2;
                    } else { // source is taller
                        sHeight = img.width / targetAspect;
                        sy = (img.height - sHeight) / 2;
                    }
                }

                ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, targetWidth, targetHeight);

                // Post-processing
                if (sharpenAfter && Math.max(targetWidth, targetHeight) < 1500) {
                    const upscaledCanvas = document.createElement('canvas');
                    const upscaledCtx = upscaledCanvas.getContext('2d')!;
                    upscaledCanvas.width = targetWidth * 2;
                    upscaledCanvas.height = targetHeight * 2;
                    upscaledCtx.imageSmoothingQuality = "high";
                    upscaledCtx.drawImage(canvas, 0, 0, upscaledCanvas.width, upscaledCanvas.height);
                    upscaledCtx.filter = 'contrast(1.1) saturate(1.05)';
                    upscaledCtx.drawImage(upscaledCanvas, 0, 0); // Re-draw to apply filter
                    
                    upscaledCanvas.toBlob(blob => {
                        resolve({ file: new File([blob!], image.file.name, { type: 'image/png' }), dataUrl: upscaledCanvas.toDataURL('image/png') });
                    }, 'image/png');
                } else {
                    canvas.toBlob(blob => {
                        resolve({ file: new File([blob!], image.file.name, { type: 'image/png' }), dataUrl: canvas.toDataURL('image/png') });
                    }, 'image/png');
                }
            };
            img.src = image.dataUrl;
        });
    };
  
  const handleGenerate = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    setDebugPrompt('');
    const limit = pLimit(1);

    const mainThemesText = noBackgroundChange ? "Không thay đổi" : selectedThemes.join(', ');
    const creativeEffectsText = selectedCreativeEffects.map(e => `${e.name} (${e.influence}%)`).join(', ');
    const generationDescription = creativeEffectsText 
      ? `${mainThemesText} + ${creativeEffectsText}` 
      : mainThemesText;

    const createGenerationTask = async (buildPromptFunction: (theme: string) => string, images: { file: File; dataUrl: string, width: number; height: number }[]) => {
      const processedImages = await Promise.all(images.map(img => (currentMode === 'wedding' ? preprocessImage(img) : Promise.resolve(img))));

      const themesToIterate = noBackgroundChange ? ["Không thay đổi"] : (selectedThemes.length > 0 ? selectedThemes : ["Default"]);


      return themesToIterate.flatMap(theme =>
        Array(variations).fill(0).map(() =>
          limit(async () => {
            const fullPrompt = buildPromptFunction(theme);
            setDebugPrompt(fullPrompt); // Set for debug view
            const imagePayload = processedImages.map(img => ({ base64ImageData: img.dataUrl.split(',')[1], mimeType: img.file.type }));
            const src = await editImage(imagePayload, fullPrompt);
            return { src, description: generationDescription };
          })
        )
      );
    };

    try {
      const themesToUse = noBackgroundChange ? ["Không thay đổi"] : (selectedThemes.length > 0 ? selectedThemes : ["Default"]);
      const totalImages = themesToUse.length * variations;
      setGeneratedImages(Array(totalImages).fill({src: 'loading', description: ''}));
      
      let tasks: Promise<{src: string, description: string}>[];

      switch (currentMode) {
        case 'wedding': {
          if (!originalImage || (selectedThemes.length === 0 && !noBackgroundChange)) {
            setError("Vui lòng tải lên ảnh và chọn ít nhất một phong cách.");
            setIsLoading(false);
            return;
          }
          const imagesToProcess = [originalImage];
          tasks = await createGenerationTask(
            (theme) => buildWeddingPrompt({ theme, subjectMode, isWeddingActive, retouchLevel, tone, bgType, accessories, additionalNotes, creativeEffects: selectedCreativeEffects, noBackgroundChange, backgroundBrightness, backgroundBlur, grainAmount }),
            imagesToProcess
          );
          break;
        }
        case 'street': {
          if (!originalImage || selectedThemes.length === 0) {
            setError("Vui lòng tải lên ảnh và chọn ít nhất một phong cách.");
            setIsLoading(false);
            return;
          }
          tasks = await createGenerationTask(
            (theme) => buildStreetPrompt({ theme, aspect: streetAspect, additionalNotes, grainAmount }),
            [originalImage]
          );
          break;
        }
        case 'restore': {
          if (!originalImage || selectedThemes.length === 0) {
            setError("Vui lòng tải lên ảnh và chọn ít nhất một kiểu phục hồi.");
            setIsLoading(false);
            return;
          }
          tasks = await createGenerationTask(
            (theme) => buildRestorePrompt({ theme, additionalNotes }),
            [originalImage]
          );
          break;
        }
        case 'reference': {
          if (!originalImage || !referenceImage || selectedThemes.length === 0) {
            setError("Vui lòng tải lên ảnh của bạn, ảnh tham chiếu và chọn ít nhất một phong cách.");
            setIsLoading(false);
            return;
          }
          // Note: preprocessImage logic is not applied to reference mode for now.
          const refImagesToProcess = [originalImage, { ...referenceImage, width: 0, height: 0 }];
          tasks = await createGenerationTask(
            (theme) => buildReferencePrompt({ theme, influence, tone, sharpness, bgType, aspect: refAspect, outputK, additionalNotes, creativeEffects: selectedCreativeEffects, grainAmount }),
            refImagesToProcess as any
          );
          break;
        }
        default:
          tasks = [];
      }

      const results = await Promise.allSettled(tasks);
      const finalImages = results.map(res =>
        res.status === 'fulfilled' ? res.value : { src: 'error', description: 'Lỗi' }
      );
      setGeneratedImages(finalImages);

    } catch (err: any) {
      console.error(err);
      setError(`Lỗi: ${err.message || 'Đã có lỗi xảy ra trong quá trình tạo ảnh.'}`);
      setGeneratedImages([]);
    } finally {
      setIsLoading(false);
    }
  }, [originalImage, referenceImage, selectedThemes, selectedCreativeEffects, additionalNotes, currentMode, subjectMode, isWeddingActive, variations, retouchLevel, tone, accessories, refAspect, outputK, bgType, influence, sharpness, noBackgroundChange, weddingAspectRatio, weddingResolution, weddingCropMethod, sharpenAfter, backgroundBrightness, backgroundBlur, streetAspect, grainAmount]);
  
  const handleDownload = (imageUrl: string) => {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `ductocdai-ai-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };
  
  const handleModeChange = (newMode: Mode) => {
    if (newMode === currentMode) return;
    
    setCurrentMode(newMode);
    
    // Reset all shared/mode-specific state
    setSelectedThemes([]);
    setSelectedCreativeEffects([]);
    setGeneratedImages([]);
    setOriginalImage(null);
    setReferenceImage(null);
    setSubjectMode('single');
    setIsWeddingActive(false);
    setError(null);
    setAdditionalNotes('');
    setNoBackgroundChange(false);
    setDebugPrompt('');
    
    // Reset states to default
    setVariations(4);
    setTone('neutral');
    setBgType('studio');
    setOutputK(4);
    setGrainAmount(0);
    
    if (newMode === 'wedding') {
        setRetouchLevel('medium');
        setAccessories([]);
        setWeddingAspectRatio('original');
        setWeddingResolution('');
    } else if (newMode === 'street') {
        setStreetAspect('4:5');
    } else if (newMode === 'restore') {
        setVariations(1);
    } else if (newMode === 'reference') {
        setRefAspect('2:3');
        setInfluence(50);
        setSharpness('medium');
    }
  };
  
  const themeGroupsToShow = THEME_DATA.groups.filter(g => g.mode === currentMode);

  const Uploader = ({ title, image, onUploadClick, onFileChange, fileInputRef, aspectRatioPreview } : any) => {
    const previewStyle = useMemo(() => {
        if (!image || !aspectRatioPreview) return {};
        const [w, h] = aspectRatioPreview.split(':').map(Number);
        const imageRatio = image.width / image.height;
        const previewRatio = w / h;

        if (imageRatio > previewRatio) { // Image is wider than preview
            return { height: '100%', width: 'auto' };
        } else { // Image is taller or same
            return { width: '100%', height: 'auto' };
        }
    }, [image, aspectRatioPreview]);
      
    return (
    <div className='relative'>
        <div 
            className="relative w-full aspect-[4/3] bg-slate-800/50 rounded-lg border-2 border-dashed border-slate-500 flex flex-col items-center justify-center text-slate-400 cursor-pointer hover:bg-slate-700/50 hover:border-yellow-400 transition-colors overflow-hidden"
            onClick={onUploadClick}
        >
            <input type="file" accept="image/jpeg,image/png,image/webp" ref={fileInputRef} onChange={onFileChange} className="hidden" />
            {image ? (
                <>
                    <img src={image.dataUrl} alt="Preview" className="absolute inset-0 w-full h-full object-cover rounded-md" style={previewStyle} />
                    {aspectRatioPreview && (
                        <div className="absolute inset-0 flex items-center justify-center">
                            <div className="bg-black/40 border-2 border-dashed border-white/50" style={{ aspectRatio: aspectRatioPreview, width: '100%' }}></div>
                        </div>
                    )}
                </>
            ) : (
                <div className='text-center'>
                    <UploadIcon className="w-10 h-10 mb-2 mx-auto" />
                    <p className="font-semibold text-sm">{title}</p>
                    <p className="text-xs">Không giới hạn kích thước</p>
                </div>
            )}
        </div>
        {image && (
             <button onClick={onUploadClick} className="w-full mt-2 flex items-center justify-center gap-2 text-sm py-2 px-4 rounded-md bg-slate-600 hover:bg-slate-500 transition-colors">
                <ArrowPathIcon className="w-4 h-4" />
                Đổi ảnh
            </button>
        )}
    </div>
  )};

  const renderControls = () => {
    const isCreativeMode = currentMode === 'wedding' || currentMode === 'reference';

    const renderCreativeEffects = () => (
       <div className='space-y-4 border-t border-slate-700/50 pt-6 mt-6'>
          <div className="flex justify-between items-baseline">
            <h3 className="text-lg font-bold text-yellow-400">Sáng tạo (nêm nếm)</h3>
            {selectedCreativeEffects.length > 0 && 
              <span className="text-sm font-medium text-yellow-300 bg-yellow-900/50 px-2 py-1 rounded-full">{selectedCreativeEffects.length} hiệu ứng</span>}
          </div>
          <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
            {CREATIVE_EFFECTS_DATA.groups.map(group => (
                <div key={group.name} className="mb-4">
                    <h4 className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wider">{group.name}</h4>
                    <div className="flex flex-wrap gap-2">
                        {group.items.map(item => (
                            <button 
                              key={item} 
                              onClick={() => handleCreativeEffectToggle(item)} 
                              className={`px-3 py-1.5 text-sm rounded-full transition-all duration-200 ${selectedCreativeEffects.some(e => e.name === item) ? 'bg-yellow-400 text-slate-900 font-bold ring-2 ring-yellow-200' : 'bg-slate-700/80 text-slate-200 hover:bg-slate-600'}`}
                            >
                              {item}
                            </button>
                        ))}
                    </div>
                </div>
            ))}
            {selectedCreativeEffects.length > 0 && <div className="border-t border-slate-700/50 my-4" />}
            <div className="space-y-4">
              {selectedCreativeEffects.map(effect => {
                const isGlitchy = GLITCH_EFFECTS.includes(effect.name);
                return (
                <div key={effect.name}>
                  <div className='flex justify-between items-center mb-1'>
                    <label htmlFor={`${effect.name}-slider`} className="text-slate-200 text-sm flex items-center gap-1">
                        {effect.name}
                        {isGlitchy && effect.influence > 20 && <span className="text-yellow-400" title="Hiệu ứng mạnh có thể tạo vệt nhiễu. Khuyến nghị ≤ 20%">⚠️</span>}
                    </label>
                    <span className='font-bold text-yellow-400 text-sm'>{effect.influence}%</span>
                  </div>
                  <input 
                    id={`${effect.name}-slider`} 
                    type="range" min="0" max={isGlitchy ? "35" : "100"}
                    value={effect.influence} 
                    onChange={e => handleCreativeEffectInfluenceChange(effect.name, parseInt(e.target.value, 10))} 
                    className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
                  />
                </div>
              )})}
            </div>
          </div>
        </div>
    );
        const previewAspectRatio = useMemo(() => {
        if (currentMode !== 'wedding' || weddingAspectRatio === 'original' || !originalImage) return undefined;
        return weddingAspectRatio;
    }, [currentMode, weddingAspectRatio, originalImage]);


    switch(currentMode) {
        case 'wedding':
            const currentResolutions = RESOLUTIONS_BY_ASPECT[weddingAspectRatio] || [];
            return (
                <>
                <div className="space-y-4">
                    <h3 className="text-lg font-bold text-yellow-400">1. Tải ảnh & Chế độ</h3>
                      <label htmlFor="couple-toggle" className="flex items-center justify-between cursor-pointer p-3 bg-slate-900/50 rounded-lg">
                        <div className="flex flex-col">
                            <span className="text-slate-200 flex items-center gap-2"><UsersIcon className="w-5 h-5"/>Ảnh gốc là ảnh cặp đôi?</span>
                            {subjectMode === 'couple' && <span className="text-xs text-yellow-400 mt-1 pl-7">Chế độ cặp đôi: Giữ 2 người</span>}
                        </div>
                        <div className="relative">
                            <input type="checkbox" id="couple-toggle" className="sr-only" checked={subjectMode === 'couple'} onChange={(e) => setSubjectMode(e.target.checked ? 'couple' : 'single')} />
                            <div className="block bg-slate-600 w-14 h-8 rounded-full"></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${subjectMode === 'couple' ? 'translate-x-6 bg-yellow-400' : ''}`}></div>
                        </div>
                    </label>
                    <label htmlFor="wedding-toggle" className="flex items-center justify-between cursor-pointer p-3 bg-slate-900/50 rounded-lg">
                        <span className="text-slate-200 flex items-center gap-2"><SparklesIcon className="w-5 h-5"/>Bật chế độ cưới</span>
                        <div className="relative">
                            <input type="checkbox" id="wedding-toggle" className="sr-only" checked={isWeddingActive} onChange={(e) => setIsWeddingActive(e.target.checked)} />
                            <div className="block bg-slate-600 w-14 h-8 rounded-full"></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-6 h-6 rounded-full transition-transform ${isWeddingActive ? 'translate-x-6 bg-yellow-400' : ''}`}></div>
                        </div>
                    </label>
                    <Uploader 
                        title="Ảnh gốc (1 hoặc 2 người)" 
                        image={originalImage} 
                        onUploadClick={() => originalImageInputRef.current?.click()} 
                        onFileChange={(e: any) => handleFileChange(e, 'original')} 
                        fileInputRef={originalImageInputRef} 
                        aspectRatioPreview={previewAspectRatio} 
                    />
                </div>
                
                <div className='space-y-4 border-t border-slate-700/50 pt-6 mt-6'>
                    <div className="group relative flex items-center gap-2">
                        <h3 className="text-lg font-bold text-yellow-400">2. Tỉ lệ khung & Độ phân giải</h3>
                        <InformationCircleIcon className="w-5 h-5 text-slate-400" />
                        <div className="absolute bottom-full mb-2 w-72 rounded-lg bg-slate-800 p-3 text-xs text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-slate-600 shadow-lg z-10">
                            <p className='font-bold text-white mb-1'>Hướng dẫn chọn tỉ lệ:</p>
                            <ul className='list-disc list-inside space-y-1'>
                                <li><span className='font-semibold'>1:1:</span> avatar, bài vuông.</li>
                                <li><span className='font-semibold'>4:5:</span> ảnh feed IG dọc.</li>
                                <li><span className='font-semibold'>9:16:</span> Story/Reel, poster dọc.</li>
                                <li><span className='font-semibold'>16:9:</span> banner/ảnh nằm.</li>
                                <li><span className='font-semibold'>Giữ tỉ lệ gốc:</span> bảo toàn bố cục.</li>
                            </ul>
                        </div>
                    </div>
                    <div>
                        <h4 className='text-slate-200 mb-2'>Tỉ lệ khung</h4>
                         <div className="grid grid-cols-3 gap-2">
                            {Object.entries(ASPECT_RATIOS).map(([label, value]) => (
                                <button key={value} onClick={() => { setWeddingAspectRatio(value); if (RESOLUTIONS_BY_ASPECT[value]) setWeddingResolution(RESOLUTIONS_BY_ASPECT[value][0]); }} className={`px-2 py-2 text-xs rounded-md transition-colors ${weddingAspectRatio === value ? 'bg-yellow-400 text-slate-900 font-bold' : 'bg-slate-700/80 hover:bg-slate-600'}`}>{label}</button>
                            ))}
                        </div>
                    </div>
                     {weddingAspectRatio !== 'original' && currentResolutions.length > 0 && (
                        <div>
                            <h4 className='text-slate-200 mb-2'>Độ phân giải</h4>
                            <div className='flex gap-2'>
                                {currentResolutions.map(res => (
                                    <button key={res} onClick={() => setWeddingResolution(res)} className={`px-3 py-1.5 text-sm rounded-full transition-all duration-200 flex-1 ${weddingResolution === res ? 'bg-yellow-400 text-slate-900 font-bold' : 'bg-slate-700/80 hover:bg-slate-600'}`}>{res}</button>
                                ))}
                            </div>
                        </div>
                     )}
                     {weddingAspectRatio !== 'original' && (
                        <div>
                            <h4 className='text-slate-200 mb-2'>Cách căn khung</h4>
                            <div className='flex gap-2'>
                                {[ {label: 'Fill (cắt vừa)', value: 'fill'}, {label: 'Fit (không cắt)', value: 'fit'} ].map(({label, value}) => <button key={value} onClick={() => setWeddingCropMethod(value as any)} className={`px-3 py-1.5 text-sm rounded-full transition-all duration-200 flex-1 ${weddingCropMethod === value ? 'bg-yellow-400 text-slate-900 font-bold' : 'bg-slate-700/80 hover:bg-slate-600'}`}>{label}</button>)}
                            </div>
                        </div>
                     )}
                     <label htmlFor="sharpen-toggle" className="flex items-center justify-between cursor-pointer mt-2">
                        <span className="text-slate-200 text-sm">Làm nét sau tạo (upscale x2 nếu ảnh nhỏ)</span>
                        <div className="relative">
                            <input type="checkbox" id="sharpen-toggle" className="sr-only" checked={sharpenAfter} onChange={(e) => setSharpenAfter(e.target.checked)} />
                            <div className="block bg-slate-600 w-10 h-6 rounded-full"></div>
                            <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${sharpenAfter ? 'translate-x-4 bg-yellow-400' : ''}`}></div>
                        </div>
                    </label>
                </div>

                <div className="space-y-4 border-t border-slate-700/50 pt-6 mt-6">
                    <div className="flex justify-between items-baseline">
                        <h3 className="text-lg font-bold text-yellow-400">3. Chọn phong cách</h3>
                        <span className="text-sm font-medium text-yellow-300 bg-yellow-900/50 px-2 py-1 rounded-full">{noBackgroundChange ? '1' : selectedThemes.length}/6</span>
                    </div>
                    <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
                         <div className="flex flex-wrap gap-2">
                            <button onClick={() => handleThemeToggle("Không thay đổi")} className={`px-3 py-1.5 text-sm rounded-full transition-all duration-200 ${noBackgroundChange ? 'bg-yellow-400 text-slate-900 font-bold ring-2 ring-yellow-200' : 'bg-slate-700/80 text-slate-200 hover:bg-slate-600'}`}>Không thay đổi</button>
                         </div>
                         <div className='border-t border-slate-700/50 my-2'/>
                        {themeGroupsToShow.map(group => (
                            <div key={group.name} className="mb-4">
                                <h4 className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wider">{group.name}</h4>
                                <div className="flex flex-wrap gap-2">
                                    {group.items.map(item => (
                                        <button key={item} onClick={() => handleThemeToggle(item)} disabled={noBackgroundChange} className={`px-3 py-1.5 text-sm rounded-full transition-all duration-200 ${selectedThemes.includes(item) ? 'bg-yellow-400 text-slate-900 font-bold ring-2 ring-yellow-200' : 'bg-slate-700/80 text-slate-200 hover:bg-slate-600'} ${noBackgroundChange ? 'opacity-50 cursor-not-allowed' : ''}`}>{item}</button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
                 <div className='space-y-4 border-t border-slate-700/50 pt-6 mt-6'>
                    <h3 className="text-lg font-bold text-yellow-400">4. Phụ kiện</h3>
                    <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
                        {ACCESSORIES_DATA.groups.map(group => (
                            <div key={group.name} className="mb-4">
                                <h4 className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wider">{group.name}</h4>
                                <div className="flex flex-wrap gap-2">
                                    {group.items.map(item => (
                                        <button key={item} onClick={() => handleAccessoryToggle(item)} className={`px-3 py-1.5 text-sm rounded-full transition-all duration-200 ${accessories.some(a => a.name === item) ? 'bg-yellow-400 text-slate-900 font-bold ring-2 ring-yellow-200' : 'bg-slate-700/80 text-slate-200 hover:bg-slate-600'}`}>{item}</button>
                                    ))}
                                </div>
                            </div>
                        ))}
                        {accessories.length > 0 && <div className="border-t border-slate-700/50 my-4" />}
                        <div className="space-y-4">
                            {accessories.map(acc => (
                                <div key={acc.name}>
                                    <div className='flex justify-between items-center mb-1'>
                                        <label htmlFor={`${acc.name}-slider`} className="text-slate-200 text-sm">{acc.name}</label>
                                        <span className='font-bold text-yellow-400 text-sm'>{acc.influence}%</span>
                                    </div>
                                    <input id={`${acc.name}-slider`} type="range" min="0" max="100" value={acc.influence} onChange={e => handleAccessoryInfluenceChange(acc.name, parseInt(e.target.value, 10))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"/>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {isCreativeMode && renderCreativeEffects()}
                <div className='space-y-4 border-t border-slate-700/50 pt-6 mt-6'>
                      <h3 className="text-lg font-bold text-yellow-400 mb-2">5. Tinh chỉnh</h3>
                        <div className='flex justify-between items-center'>
                              <label htmlFor="variations-slider" className="text-slate-200">Số biến thể / kiểu</label>
                              <span className='font-bold text-yellow-400'>{variations}</span>
                        </div>
                        <input id="variations-slider" type="range" min="1" max="8" value={variations} onChange={e => setVariations(parseInt(e.target.value, 10))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"/>
                        
                        <div>
                            <h4 className='text-slate-200 mb-2'>Tông màu</h4>
                            <div className='grid grid-cols-3 gap-2'>
                                {[ {label: 'Ấm', value: 'warm'}, {label: 'Trung tính', value: 'neutral'}, {label: 'Mát', value: 'cool'} ].map(({label, value}) => <button key={value} onClick={() => setTone(value as any)} className={`px-3 py-1.5 text-sm rounded-full transition-all duration-200 flex-1 ${tone === value ? 'bg-yellow-400 text-slate-900 font-bold' : 'bg-slate-700/80 hover:bg-slate-600'}`}>{label}</button>)}
                            </div>
                        </div>
                        <div>
                            <h4 className='text-slate-200 mb-2'>Độ mịn da</h4>
                            <div className='grid grid-cols-3 gap-2'>
                                {[ {label: 'Nhẹ', value: 'light'}, {label: 'Vừa', value: 'medium'}, {label: 'Kỹ', value: 'pro'} ].map(({label, value}) => <button key={value} onClick={() => setRetouchLevel(value as any)} className={`px-3 py-1.5 text-sm rounded-full transition-all duration-200 flex-1 ${retouchLevel === value ? 'bg-yellow-400 text-slate-900 font-bold' : 'bg-slate-700/80 hover:bg-slate-600'}`}>{label}</button>)}
                            </div>
                        </div>
                        <div className='flex justify-between items-center'>
                              <label htmlFor="brightness-slider" className="text-slate-200">Độ sáng nền</label>
                              <span className='font-bold text-yellow-400'>{backgroundBrightness}%</span>
                        </div>
                        <input id="brightness-slider" type="range" min="0" max="100" value={backgroundBrightness} onChange={e => setBackgroundBrightness(parseInt(e.target.value, 10))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"/>
                        
                        <div className='flex justify-between items-center'>
                              <label htmlFor="blur-slider" className="text-slate-200">Độ mờ hậu cảnh</label>
                              <span className='font-bold text-yellow-400'>{backgroundBlur}%</span>
                        </div>
                        <input id="blur-slider" type="range" min="0" max="100" value={backgroundBlur} onChange={e => setBackgroundBlur(parseInt(e.target.value, 10))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"/>
                        
                        <div className='flex justify-between items-center'>
                            <label htmlFor="grain-slider" className="text-slate-200">Độ hạt (Grain)</label>
                            <span className='font-bold text-yellow-400'>{grainAmount}%</span>
                        </div>
                        <input id="grain-slider" type="range" min="0" max="100" value={grainAmount} onChange={e => setGrainAmount(parseInt(e.target.value, 10))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"/>

                        <div>
                            <h4 className='text-slate-200 mb-2'>Bối cảnh</h4>
                            <div className='grid grid-cols-2 gap-2'>
                                {[ {label: 'Studio', value: 'studio'}, {label: 'Ngoại cảnh', value: 'outdoor'} ].map(({label, value}) => <button key={value} onClick={() => setBgType(value as any)} className={`px-3 py-1.5 text-sm rounded-full transition-all duration-200 flex-1 ${bgType === value ? 'bg-yellow-400 text-slate-900 font-bold' : 'bg-slate-700/80 hover:bg-slate-600'}`}>{label}</button>)}
                            </div>
                        </div>
                        
                        <textarea value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} placeholder="Ghi chú thêm..." className="w-full p-2 rounded-lg bg-slate-900/70 border border-slate-700 focus:ring-2 focus:ring-yellow-500 focus:outline-none transition-all duration-300 text-slate-300 text-sm" rows={2}/>
                </div>
                </>
            );
        case 'street':
            return (
                 <>
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-yellow-400">1. Tải ảnh của bạn</h3>
                        <Uploader title="Nhấn để tải ảnh lên" image={originalImage} onUploadClick={() => originalImageInputRef.current?.click()} onFileChange={(e: any) => handleFileChange(e, 'original')} fileInputRef={originalImageInputRef}/>
                    </div>
                    <div className="space-y-4 border-t border-slate-700/50 pt-6 mt-6">
                        <div className="flex justify-between items-baseline">
                            <h3 className="text-lg font-bold text-yellow-400">2. Chọn phong cách</h3>
                             <span className="text-sm font-medium text-yellow-300 bg-yellow-900/50 px-2 py-1 rounded-full">{selectedThemes.length}/5</span>
                        </div>
                        <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
                            {themeGroupsToShow.map(group => (
                                <div key={group.name} className="flex flex-wrap gap-2">
                                    {group.items.map(item => (
                                        <button key={item} onClick={() => handleThemeToggle(item)} className={`px-3 py-1.5 text-sm rounded-full transition-all duration-200 ${selectedThemes.includes(item) ? 'bg-yellow-400 text-slate-900 font-bold ring-2 ring-yellow-200' : 'bg-slate-700/80 text-slate-200 hover:bg-slate-600'}`}>{item}</button>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className='space-y-4 border-t border-slate-700/50 pt-6 mt-6'>
                         <h3 className="text-lg font-bold text-yellow-400 mb-2">3. Tinh chỉnh</h3>
                            <div className='flex justify-between items-center'>
                                  <label htmlFor="variations-slider" className="text-slate-200">Số biến thể / kiểu</label>
                                  <span className='font-bold text-yellow-400'>{variations}</span>
                            </div>
                            <input id="variations-slider" type="range" min="1" max="8" value={variations} onChange={e => setVariations(parseInt(e.target.value, 10))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"/>
                             <div className='flex justify-between items-center'>
                                <label htmlFor="grain-slider" className="text-slate-200">Độ hạt (Grain)</label>
                                <span className='font-bold text-yellow-400'>{grainAmount}%</span>
                            </div>
                            <input id="grain-slider" type="range" min="0" max="100" value={grainAmount} onChange={e => setGrainAmount(parseInt(e.target.value, 10))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"/>
                            <div>
                                <h4 className='text-slate-200 mb-2'>Tỷ lệ khung</h4>
                                <div className='flex gap-2'>
                                    {[ {label: '3:2 (Ngang)', value: '3:2'}, {label: '4:5 (Dọc)', value: '4:5'} ].map(({label, value}) => <button key={value} onClick={() => setStreetAspect(value as any)} className={`px-3 py-1.5 text-sm rounded-full transition-all duration-200 flex-1 ${streetAspect === value ? 'bg-yellow-400 text-slate-900 font-bold' : 'bg-slate-700/80 hover:bg-slate-600'}`}>{label}</button>)}
                                </div>
                            </div>
                            <textarea value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} placeholder="Ghi chú thêm..." className="w-full p-2 rounded-lg bg-slate-900/70 border border-slate-700 focus:ring-2 focus:ring-yellow-500 focus:outline-none transition-all duration-300 text-slate-300 text-sm" rows={2}/>
                    </div>
                </>
            );
        case 'restore':
            return (
                 <>
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-yellow-400">1. Tải ảnh cũ</h3>
                        <Uploader title="Nhấn để tải ảnh lên" image={originalImage} onUploadClick={() => originalImageInputRef.current?.click()} onFileChange={(e: any) => handleFileChange(e, 'original')} fileInputRef={originalImageInputRef}/>
                    </div>
                    <div className="space-y-4 border-t border-slate-700/50 pt-6 mt-6">
                        <div className="flex justify-between items-baseline">
                            <h3 className="text-lg font-bold text-yellow-400">2. Chọn kiểu phục hồi</h3>
                             <span className="text-sm font-medium text-yellow-300 bg-yellow-900/50 px-2 py-1 rounded-full">{selectedThemes.length}/5</span>
                        </div>
                        <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
                            {themeGroupsToShow.map(group => (
                                <div key={group.name} className="flex flex-wrap gap-2">
                                    {group.items.map(item => (
                                        <button key={item} onClick={() => handleThemeToggle(item)} className={`px-3 py-1.5 text-sm rounded-full transition-all duration-200 ${selectedThemes.includes(item) ? 'bg-yellow-400 text-slate-900 font-bold ring-2 ring-yellow-200' : 'bg-slate-700/80 text-slate-200 hover:bg-slate-600'}`}>{item}</button>
                                    ))}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className='space-y-4 border-t border-slate-700/50 pt-6 mt-6'>
                         <h3 className="text-lg font-bold text-yellow-400 mb-2">3. Tinh chỉnh</h3>
                            <div className='flex justify-between items-center'>
                                  <label htmlFor="variations-slider" className="text-slate-200">Số biến thể / kiểu</label>
                                  <span className='font-bold text-yellow-400'>{variations}</span>
                            </div>
                            <input id="variations-slider" type="range" min="1" max="8" value={variations} onChange={e => setVariations(parseInt(e.target.value, 10))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"/>
                            <textarea value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} placeholder="Ghi chú thêm..." className="w-full p-2 rounded-lg bg-slate-900/70 border border-slate-700 focus:ring-2 focus:ring-yellow-500 focus:outline-none transition-all duration-300 text-slate-300 text-sm" rows={2}/>
                    </div>
                </>
            );
        case 'reference':
            return (
                 <>
                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-yellow-400">1. Tải ảnh</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <Uploader title="Tải ảnh của bạn" image={originalImage} onUploadClick={() => originalImageInputRef.current?.click()} onFileChange={(e: any) => handleFileChange(e, 'original')} fileInputRef={originalImageInputRef} />
                            <Uploader title="Tải ảnh mẫu tham chiếu" image={referenceImage} onUploadClick={() => referenceInputRef.current?.click()} onFileChange={(e: any) => handleFileChange(e, 'reference')} fileInputRef={referenceInputRef} />
                        </div>
                    </div>

                    <div className="space-y-4 border-t border-slate-700/50 pt-6 mt-6">
                        <div className="flex justify-between items-baseline">
                            <h3 className="text-lg font-bold text-yellow-400">2. Chọn phong cách</h3>
                            <span className="text-sm font-medium text-yellow-300 bg-yellow-900/50 px-2 py-1 rounded-full">{selectedThemes.length}/6</span>
                        </div>
                        <div className="space-y-4 max-h-80 overflow-y-auto pr-2">
                            {themeGroupsToShow.map(group => (
                                <div key={group.name} className="mb-4">
                                    <h4 className="text-sm font-semibold text-slate-300 mb-2 uppercase tracking-wider">{group.name}</h4>
                                    <div className="flex flex-wrap gap-2">
                                        {group.items.map(item => (
                                            <button key={item} onClick={() => handleThemeToggle(item)} className={`px-3 py-1.5 text-sm rounded-full transition-all duration-200 ${selectedThemes.includes(item) ? 'bg-yellow-400 text-slate-900 font-bold ring-2 ring-yellow-200' : 'bg-slate-700/80 text-slate-200 hover:bg-slate-600'}`}>{item}</button>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    {isCreativeMode && renderCreativeEffects()}
                    <div className='space-y-4 border-t border-slate-700/50 pt-6 mt-6'>
                         <h3 className="text-lg font-bold text-yellow-400 mb-2">3. Tinh chỉnh</h3>
                            <div className='flex justify-between items-center'>
                                  <label htmlFor="influence-slider" className="text-slate-200">Mức độ ảnh hưởng</label>
                                  <span className='font-bold text-yellow-400'>{influence}%</span>
                            </div>
                            <input id="influence-slider" type="range" min="0" max="100" value={influence} onChange={e => setInfluence(parseInt(e.target.value, 10))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"/>
                            
                             <div className='flex justify-between items-center'>
                                <label htmlFor="grain-slider" className="text-slate-200">Độ hạt (Grain)</label>
                                <span className='font-bold text-yellow-400'>{grainAmount}%</span>
                            </div>
                            <input id="grain-slider" type="range" min="0" max="100" value={grainAmount} onChange={e => setGrainAmount(parseInt(e.target.value, 10))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"/>

                            <div>
                                <h4 className='text-slate-200 mb-2'>Tông màu</h4>
                                <div className='flex gap-2'>
                                    {[ {label: 'Ấm', value: 'warm'}, {label: 'Trung tính', value: 'neutral'}, {label: 'Lạnh', value: 'cool'} ].map(({label, value}) => <button key={value} onClick={() => setTone(value as any)} className={`px-3 py-1.5 text-sm rounded-full transition-all duration-200 flex-1 ${tone === value ? 'bg-yellow-400 text-slate-900 font-bold' : 'bg-slate-700/80 hover:bg-slate-600'}`}>{label}</button>)}
                                </div>
                            </div>
                            <div>
                                <h4 className='text-slate-200 mb-2'>Độ sắc nét</h4>
                                <div className='flex gap-2'>
                                    {[ {label: 'Nhẹ', value: 'light'}, {label: 'Vừa', value: 'medium'}, {label: 'Kỹ', value: 'pro'} ].map(({label, value}) => <button key={value} onClick={() => setSharpness(value as any)} className={`px-3 py-1.5 text-sm rounded-full transition-all duration-200 flex-1 ${sharpness === value ? 'bg-yellow-400 text-slate-900 font-bold' : 'bg-slate-700/80 hover:bg-slate-600'}`}>{label}</button>)}
                                </div>
                            </div>
                             <div>
                                <h4 className='text-slate-200 mb-2'>Bối cảnh</h4>
                                <div className='flex gap-2'>
                                    {[ {label: 'Studio', value: 'studio'}, {label: 'Ngoại cảnh', value: 'outdoor'} ].map(({label, value}) => <button key={value} onClick={() => setBgType(value as any)} className={`px-3 py-1.5 text-sm rounded-full transition-all duration-200 flex-1 ${bgType === value ? 'bg-yellow-400 text-slate-900 font-bold' : 'bg-slate-700/80 hover:bg-slate-600'}`}>{label}</button>)}
                                </div>
                            </div>
                            <div>
                                <h4 className='text-slate-200 mb-2'>Tỷ lệ khung</h4>
                                <div className='flex gap-2'>
                                    {[ {label: '2:3', value: '2:3'}, {label: '3:2', value: '3:2'}, {label: '4:5', value: '4:5'} ].map(({label, value}) => <button key={value} onClick={() => setRefAspect(value as any)} className={`px-3 py-1.5 text-sm rounded-full transition-all duration-200 flex-1 ${refAspect === value ? 'bg-yellow-400 text-slate-900 font-bold' : 'bg-slate-700/80 hover:bg-slate-600'}`}>{label}</button>)}
                                </div>
                            </div>
                            <div>
                                <h4 className='text-slate-200 mb-2'>Độ phân giải</h4>
                                <div className='flex gap-2'>
                                    {[ {label: '2K', value: 2}, {label: '4K', value: 4} ].map(({label, value}) => <button key={value} onClick={() => setOutputK(value as any)} className={`px-3 py-1.5 text-sm rounded-full transition-all duration-200 flex-1 ${outputK === value ? 'bg-yellow-400 text-slate-900 font-bold' : 'bg-slate-700/80 hover:bg-slate-600'}`}>{label}</button>)}
                                </div>
                            </div>
                            <textarea value={additionalNotes} onChange={(e) => setAdditionalNotes(e.target.value)} placeholder="Ghi chú thêm..." className="w-full p-2 rounded-lg bg-slate-900/70 border border-slate-700 focus:ring-2 focus:ring-yellow-500 focus:outline-none transition-all duration-300 text-slate-300 text-sm" rows={2}/>
                    </div>
                </>
            );
        default:
            return null;
    }
  }

  const getHeaderText = () => {
    switch(currentMode) {
        case 'wedding': return { title: 'Ảnh Cưới AI', subtitle: 'Tạo ảnh cưới chuyên nghiệp từ ảnh của bạn' };
        case 'street': return { title: 'Street Gritty AI', subtitle: 'Tạo ảnh chân dung đường phố bụi bặm' };
        case 'restore': return { title: 'Phục Hồi Ảnh AI', subtitle: 'Khôi phục ký ức từ ảnh cũ, giữ trọn vẹn gương mặt' };
        case 'reference': return { title: 'Ảnh Đối Chiếu AI', subtitle: 'Áp dụng phong cách từ ảnh mẫu vào ảnh của bạn' };
        default: return { title: 'AI Suite', subtitle: 'Create amazing images with AI' };
    }
  }
  
  const headerText = getHeaderText();

  return (
    <div className="min-h-screen text-white p-4 sm:p-6 md:p-8 relative overflow-hidden">
        <ContactLinks />

        <p className="absolute top-4 left-4 sm:top-6 sm:left-6 text-white font-bold text-lg z-20" style={{textShadow: '1px 1px 3px rgba(0,0,0,0.8)'}}>
            Ductocdai
        </p>

        <div className="relative z-10">
            <header className="w-full max-w-7xl mx-auto text-center mb-8">
                <h1 className="text-3xl sm:text-5xl font-black text-white tracking-wide">
                    Ductocdai <span className="text-yellow-400">AI Suite</span>
                </h1>
                <p className="text-slate-400 mt-2 text-lg">{headerText.subtitle}</p>
            </header>

            <main className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-5 gap-8">
                <div className="lg:col-span-2 bg-slate-900/70 border border-slate-700/50 rounded-2xl p-6 shadow-2xl flex flex-col space-y-6 h-fit">
                    
                    {/* Mode Toggle */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 bg-slate-800 rounded-full">
                        <button onClick={() => handleModeChange('wedding')} className={`px-2 py-2 text-xs sm:text-sm font-bold rounded-full transition-colors ${currentMode === 'wedding' ? 'bg-yellow-400 text-slate-900' : 'bg-transparent text-slate-300 hover:bg-slate-700'}`}>Ảnh Cưới AI</button>
                        <button onClick={() => handleModeChange('street')} className={`px-2 py-2 text-xs sm:text-sm font-bold rounded-full transition-colors ${currentMode === 'street' ? 'bg-yellow-400 text-slate-900' : 'bg-transparent text-slate-300 hover:bg-slate-700'}`}>Street Gritty</button>
                        <button onClick={() => handleModeChange('restore')} className={`px-2 py-2 text-xs sm:text-sm font-bold rounded-full transition-colors ${currentMode === 'restore' ? 'bg-yellow-400 text-slate-900' : 'bg-transparent text-slate-300 hover:bg-slate-700'}`}>Phục Hồi Ảnh</button>
                        <button onClick={() => handleModeChange('reference')} className={`px-2 py-2 text-xs sm:text-sm font-bold rounded-full transition-colors ${currentMode === 'reference' ? 'bg-yellow-400 text-slate-900' : 'bg-transparent text-slate-300 hover:bg-slate-700'}`}>Ảnh Đối Chiếu</button>
                    </div>

                    {/* Controls */}
                    {renderControls()}
                    
                    <button
                        onClick={handleGenerate}
                        disabled={isLoading || (!originalImage) || (currentMode === 'wedding' && selectedThemes.length === 0 && !noBackgroundChange) || (currentMode === 'reference' && !referenceImage)}
                        className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-lg bg-yellow-400 hover:bg-yellow-300 disabled:bg-slate-600 disabled:cursor-not-allowed text-slate-900 font-bold text-lg transition-all duration-300 transform hover:scale-105 disabled:scale-100 shadow-lg shadow-yellow-500/30"
                    >
                        {isLoading ? ( <> <Spinner /> Đang tạo... </> ) : ( <> <SparklesIcon className="w-6 h-6" /> Tạo ảnh </>)}
                    </button>

                     {debugPrompt && (
                        <details className="mt-2 text-xs">
                            <summary className="cursor-pointer text-slate-500 hover:text-slate-300">Xem Prompt</summary>
                            <pre className="mt-2 p-2 bg-slate-800/50 border border-slate-700 rounded-md whitespace-pre-wrap font-mono text-slate-400 break-words">{debugPrompt}</pre>
                        </details>
                    )}
                </div>

                <div className="lg:col-span-3 bg-slate-900/70 border border-slate-700/50 rounded-2xl p-6 shadow-2xl">
                     <div className="flex justify-between items-center mb-4 flex-wrap gap-4">
                        <h2 className="text-2xl font-bold text-yellow-300">Kết quả</h2>
                    </div>
                    
                    {generatedImages.length === 0 && !error && (
                        <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 border-2 border-dashed border-slate-600 rounded-lg min-h-[400px]">
                            <PhotoIcon className="w-16 h-16 mx-auto mb-4" />
                            <p className="text-lg font-medium">Ảnh của bạn sẽ hiện ở đây</p>
                        </div>
                    )}

                    {error && (
                        <div className="h-full flex flex-col items-center justify-center text-center text-red-400 p-4 border-2 border-dashed border-red-500/50 bg-red-900/20 rounded-lg min-h-[400px]">
                            <ExclamationTriangleIcon className="w-12 h-12 mx-auto mb-4" />
                            <p className="font-bold">Tạo ảnh thất bại</p>
                            <p className="text-sm mt-2">{error}</p>
                        </div>
                    )}
                    
                    {generatedImages.length > 0 && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                            {generatedImages.map((img, index) => (
                                <div 
                                    key={index} 
                                    className="aspect-square bg-slate-900 rounded-lg flex items-center justify-center relative group overflow-hidden cursor-pointer"
                                    onClick={() => img.src !== 'loading' && img.src !== 'error' && setModalImage(img)}
                                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { img.src !== 'loading' && img.src !== 'error' && setModalImage(img) } }}
                                    role="button"
                                    tabIndex={0}
                                    aria-label={`Xem ảnh ${index + 1}`}
                                >
                                    {img.src === 'loading' && <Spinner size="lg" />}
                                    {img.src === 'error' && <div className="text-red-400 text-center p-2"><ExclamationTriangleIcon className="w-8 h-8 mx-auto mb-2" /><p className="text-xs font-semibold">Lỗi</p></div>}
                                    {img.src !== 'loading' && img.src !== 'error' && (
                                        <>
                                            <img src={img.src} alt={`Generated image ${index + 1}`} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-2 flex flex-col justify-end">
                                                <p className="text-white font-bold text-center text-[10px] leading-tight drop-shadow-lg" style={{textShadow: '2px 2px 4px #000'}}>{img.description}</p>
                                            </div>
                                            <div className="absolute inset-0 bg-black/60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                                <button 
                                                  onClick={(e) => { e.stopPropagation(); handleDownload(img.src); }} 
                                                  className="p-3 bg-yellow-500 text-slate-900 rounded-full hover:bg-yellow-400 transform hover:scale-110 transition-transform"
                                                  aria-label={`Tải ảnh ${index + 1}`}
                                                >
                                                    <DownloadIcon className="w-6 h-6" />
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            ))}
                             <div className="aspect-square rounded-lg flex items-center justify-center p-4">
                                <button onClick={() => setGeneratedImages([])} className="flex flex-col items-center justify-center gap-2 text-slate-400 hover:text-white transition-colors">
                                    <TrashIcon className="w-8 h-8" />
                                    <span className="text-sm font-semibold">Xóa kết quả</span>
                                </button>
                             </div>
                        </div>
                    )}
                </div>
            </main>
        </div>
        <ImageModal
          show={!!modalImage}
          imageUrl={modalImage?.src || ''}
          displayText={modalImage?.description || ''}
          onClose={() => setModalImage(null)}
        />
    </div>
  );
};

export default App;
