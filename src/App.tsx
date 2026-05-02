/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Upload, Camera, Sparkles, RefreshCw, Layers, CheckCircle2, ArrowRight, Download, Share2 } from "lucide-react";
import html2canvas from "html2canvas";
import { analyzeItem, generateOutfitImage, generateModelImage, type AnalysisResult, type OutfitRecommendation } from "./services/gemini";

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [generatingImages, setGeneratingImages] = useState<Record<string, boolean>>({});
  const [generatingModels, setGeneratingModels] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, { message: string, type: 'flat' | 'model' | 'global' } | null>>({});
  const [selectedOutfitIdx, setSelectedOutfitIdx] = useState<number | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const outfitRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        setResult(null); // Reset result on new upload
      };
      reader.readAsDataURL(file);
    }
  };

  const startAnalysis = async () => {
    if (!image) return;
    setAnalyzing(true);
    setErrors(prev => ({ ...prev, global: null }));
    try {
      const base64Data = image.split(",")[1];
      const mimeType = image.split(";")[0].split(":")[1];
      const data = await analyzeItem(base64Data, mimeType);
      setResult(data);
      
      // Automatically trigger flat-lay generation for all three outfits in parallel
      data.outfits.forEach(outfit => {
        generateImage(outfit);
      });
    } catch (error) {
      console.error("Analysis failed:", (error as Error).message);
      if ((error as Error).message === "QUOTA_EXCEEDED") {
        setErrors(prev => ({ ...prev, global: { message: "The fashion studio is currently at capacity. Please wait a moment and try again.", type: 'global' } }));
      } else {
        setErrors(prev => ({ ...prev, global: { message: "Analysis encountered an issue. Please try again.", type: 'global' } }));
      }
    } finally {
      setAnalyzing(false);
    }
  };

  const generateImage = async (outfit: OutfitRecommendation) => {
    if (outfit.image || generatingImages[outfit.type] || !image) return;

    setGeneratingImages(prev => ({ ...prev, [outfit.type]: true }));
    setErrors(prev => ({ ...prev, [outfit.type]: null }));
    try {
      const base64Data = image.split(",")[1];
      const mimeType = image.split(";")[0].split(":")[1];
      const imageUrl = await generateOutfitImage(outfit.visualPrompt, base64Data, mimeType);
      setResult(prev => {
        if (!prev) return null;
        return {
          ...prev,
          outfits: prev.outfits.map(o => 
            o.type === outfit.type ? { ...o, image: imageUrl } : o
          )
        };
      });
    } catch (error) {
      console.error("Image generation failed:", (error as Error).message);
      const isQuota = (error as Error).message === "QUOTA_EXCEEDED";
      setErrors(prev => ({ 
        ...prev, 
        [outfit.type]: { 
          message: isQuota ? "Studio limit reached. Try again shortly." : "Failed to compose outfit. Tap to retry.", 
          type: 'flat' 
        } 
      }));
    } finally {
      setGeneratingImages(prev => ({ ...prev, [outfit.type]: false }));
    }
  };

  const generateModelView = async (outfit: OutfitRecommendation) => {
    if (outfit.modelImage || generatingModels[outfit.type] || !image) return;

    setGeneratingModels(prev => ({ ...prev, [outfit.type]: true }));
    setErrors(prev => ({ ...prev, [outfit.type]: null }));
    try {
      const base64Data = image.split(",")[1];
      const mimeType = image.split(";")[0].split(":")[1];
      const imageUrl = await generateModelImage(outfit.visualPrompt, base64Data, mimeType);
      setResult(prev => {
        if (!prev) return null;
        return {
          ...prev,
          outfits: prev.outfits.map(o => 
            o.type === outfit.type ? { ...o, modelImage: imageUrl } : o
          )
        };
      });
    } catch (error) {
      console.error("Model image generation failed:", (error as Error).message);
      const isQuota = (error as Error).message === "QUOTA_EXCEEDED";
      setErrors(prev => ({ 
        ...prev, 
        [outfit.type]: { 
          message: isQuota ? "Studio editorial staff busy. Please try again in a moment." : "Transformation failed. Tap to retry.", 
          type: 'model' 
        } 
      }));
    } finally {
      setGeneratingModels(prev => ({ ...prev, [outfit.type]: false }));
    }
  };

  const handleWearNow = async (type: string) => {
    const element = outfitRefs.current[type];
    if (!element) return;

    try {
      const canvas = await html2canvas(element, {
        useCORS: true,
        backgroundColor: null,
        scale: 2, // Higher quality
        logging: false,
        onclone: (clonedDoc) => {
          // Fix for html2canvas not supporting modern color functions common in Tailwind 4
          const style = clonedDoc.createElement('style');
          style.innerHTML = `
            * { 
              color-scheme: light !important;
              color: inherit;
              background-color: inherit;
            }
          `;
          clonedDoc.head.appendChild(style);
        },
        ignoreElements: (element) => {
          return element.classList.contains('scanner-beam');
        }
      });
      
      const image = canvas.toDataURL("image/png");
      const link = document.createElement("a");
      link.href = image;
      link.download = `vogueai-${type.toLowerCase()}-look.png`;
      link.click();

      // Check for share API support
      if (navigator.share) {
        try {
          const blob = await (await fetch(image)).blob();
          const file = new File([blob], `vogueai-${type.toLowerCase()}-look.png`, { type: "image/png" });
          await navigator.share({
            files: [file],
            title: `My VogueAI ${type} Look`,
            text: "Check out this outfit curated for me by VogueAI!",
          });
        } catch (shareError) {
          console.log("Sharing failed or cancelled", shareError);
        }
      }
    } catch (error) {
      console.error("Screenshot failed:", error);
    }
  };

  const getOutfitLabel = (type: string) => {
    switch (type) {
      case "Casual": return "Casual Wear";
      case "Business": return "Professional Outfit";
      case "Night Out": return "Night Out Outfit";
      default: return type;
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg px-4 py-12 md:px-16 max-w-[1800px] mx-auto transition-all duration-1000 flex flex-col">
      <header className="flex flex-col items-center mb-16 text-center space-y-6">
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex flex-col items-center space-y-3"
        >
          <div className="flex items-center gap-4 mb-2">
            <div className="h-[1px] w-12 bg-brand-gold/30"></div>
            <span className="text-[10px] font-bold uppercase tracking-[0.5em] text-brand-gold">The Future of Fashion</span>
            <div className="h-[1px] w-12 bg-brand-gold/30"></div>
          </div>
          <h1 className="text-6xl md:text-8xl font-display leading-[0.9] text-brand-black italic gold-glow">
            Style<span className="text-brand-gold not-italic">Sync</span>
          </h1>
        </motion.div>
      </header>

      <div className="w-full">
        {!result ? (
          <section className="max-w-2xl mx-auto w-full">
            <div className="luxury-card min-h-[420px] flex flex-col bg-white border border-brand-gold/5 overflow-hidden">
              <div className="relative flex-1 bg-white flex flex-col items-center justify-center p-12 group overflow-hidden">
                <input 
                  type="file" 
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept="image/*"
                  className="hidden"
                />
                
                {!image ? (
                  <motion.div 
                    onClick={() => fileInputRef.current?.click()}
                    whileHover={{ scale: 1.02 }}
                    className="flex flex-col items-center gap-4 cursor-pointer"
                  >
                    <div className="text-brand-gold group-hover:scale-110 transition-transform duration-500">
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                    </div>
                    <div className="text-center space-y-1">
                      <p className="font-display text-4xl tracking-tight text-brand-black italic">Portrait Photo</p>
                      <p className="text-brand-black/40 text-[9px] font-bold uppercase tracking-[0.4em]">REQUIRED</p>
                    </div>
                  </motion.div>
                ) : (
                  <div className="relative w-full h-full flex flex-col items-center gap-8">
                    <motion.div 
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="relative z-10 w-full max-w-md aspect-[3/4] rounded-3xl shadow-2xl overflow-hidden border-[12px] border-white ring-1 ring-brand-gold/10 bg-brand-bg"
                    >
                      <img src={image} alt="Source" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      {analyzing && (
                        <motion.div 
                          initial={{ top: "-10%" }}
                          animate={{ top: "110%" }}
                          transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
                          className="scanner-beam z-20"
                        />
                      )}
                    </motion.div>

                    {!analyzing && (
                      <div className="flex flex-col items-center gap-6">
                        {errors.global && (
                          <div className="text-center p-4 bg-brand-gold/5 rounded-2xl border border-brand-gold/10">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-gold mb-1">Studio Update</p>
                            <p className="text-[11px] font-medium text-black/60 italic">{errors.global.message}</p>
                          </div>
                        )}
                        <div className="flex gap-4">
                          <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="px-8 py-3 rounded-full border border-brand-gold/20 text-[11px] font-bold uppercase tracking-widest text-brand-gold hover:bg-brand-gold hover:text-white transition-all"
                          >
                            Change Photo
                          </button>
                          <button
                            onClick={startAnalysis}
                            className="px-10 py-3 rounded-full bg-brand-gold text-white text-[11px] font-bold uppercase tracking-widest hover:bg-brand-gold/90 transition-all shadow-lg flex items-center gap-2"
                          >
                            <Sparkles className="w-4 h-4" />
                            Begin Transformation
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </section>
        ) : (
          <div className="flex flex-col lg:flex-row gap-12 lg:gap-20 items-start py-8">
            {/* Left Column: Original Item */}
            <div className="w-full lg:w-[35%] transition-all duration-1000">
               <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                className="relative aspect-[3/4] rounded-[32px] overflow-hidden bg-white shadow-[0_40px_80px_rgba(0,0,0,0.08)] ring-1 ring-brand-gold/10 p-6"
               >
                 <div className="absolute top-8 left-8 z-10 bg-brand-gold text-white text-[8px] font-black uppercase tracking-[0.2em] px-3 py-1 rounded-full">
                   SOURCE
                 </div>
                 <img src={image} alt="Original" className="w-full h-full object-cover rounded-[20px]" />
               </motion.div>
               <div className="mt-8 px-4">
                 <h3 className="font-display text-2xl text-brand-black mb-2 italic">Captured Silhouette</h3>
                 <p className="text-[11px] text-brand-black/40 font-medium leading-relaxed uppercase tracking-widest">{result.itemDescription}</p>
                 <button 
                  onClick={() => { setImage(null); setResult(null); }}
                  className="mt-6 text-brand-gold text-[9px] font-bold uppercase tracking-[0.3em] hover:opacity-70 transition-opacity flex items-center gap-3"
                 >
                    <RefreshCw className="w-3 h-3" />
                    New transformation
                 </button>
               </div>
            </div>

            {/* Right Column: Title + Gallery */}
            <div className="w-full lg:w-[65%]">
              <div className="mb-16 flex flex-col items-center text-center">
                <h2 className="text-4xl md:text-5xl font-display text-brand-black italic mb-6">Heritage <span className="text-brand-gold">Preview</span></h2>
                <div className="h-[2px] w-24 bg-brand-gold brand-shimmer rounded-full"></div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {result.outfits.map((outfit, idx) => (
                  <motion.div
                    key={outfit.type}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.1 }}
                    className="relative group cursor-pointer"
                    onClick={() => {
                      if (errors[outfit.type]?.type === 'model') {
                        generateModelView(outfit);
                        return;
                      }
                      if (!outfit.image && !outfit.modelImage) {
                         generateImage(outfit);
                      } else {
                         setSelectedOutfitIdx(idx);
                         setIsModalOpen(true);
                      }
                    }}
                  >
                    <div className="aspect-[2/3] rounded-[24px] overflow-hidden bg-[#eeede9] relative shadow-lg group-hover:shadow-2xl transition-all duration-500">
                       <AnimatePresence mode="wait">
                          {outfit.modelImage ? (
                             <motion.div 
                               initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                               className="w-full h-full bg-brand-black/5 p-4"
                             >
                               <img 
                                 key="model"
                                 src={outfit.modelImage} 
                                 className="w-full h-full object-contain" 
                               />
                             </motion.div>
                          ) : outfit.image ? (
                             <div className="relative w-full h-full">
                               <motion.img 
                                 key="flat"
                                 initial={{ opacity: 0 }} animate={{ opacity: 1 }} 
                                 src={outfit.image} className="w-full h-full object-cover" 
                               />
                               {errors[outfit.type]?.type === 'model' && !generatingModels[outfit.type] && (
                                 <div className="absolute inset-0 bg-brand-black/40 backdrop-blur-[2px] flex flex-col items-center justify-center p-4 text-white text-center">
                                   <RefreshCw className="w-6 h-6 mb-2 text-brand-gold" />
                                   <p className="text-[10px] font-bold uppercase tracking-widest">Studio Busy</p>
                                   <p className="text-[8px] font-medium italic opacity-80">Tap to retry transformation</p>
                                 </div>
                               )}
                               {generatingModels[outfit.type] && (
                                 <div className="absolute inset-0 bg-white/40 backdrop-blur-sm flex items-center justify-center">
                                   <div className="w-8 h-8 border-2 border-brand-gold border-t-transparent rounded-full animate-spin" />
                                 </div>
                               )}
                             </div>
                          ) : (
                             <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center">
                              {generatingImages[outfit.type] || generatingModels[outfit.type] ? (
                                <div className="flex flex-col items-center gap-4">
                                   <div className="w-8 h-8 border-2 border-brand-gold border-t-transparent rounded-full animate-spin" />
                                   <span className="text-[8px] font-bold uppercase tracking-[0.2em] text-brand-gold italic">
                                     {generatingModels[outfit.type] ? 'Editorial transformation in progress...' : 'Composing layout...'}
                                   </span>
                                   <p className="text-[7px] text-brand-black/30 uppercase tracking-tighter">Please wait, refining essence</p>
                                </div>
                               ) : (
                                 <div className="flex flex-col items-center gap-3 group-hover:scale-110 transition-transform">
                                    <Sparkles className="w-6 h-6 text-brand-gold/20" />
                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-black/20 italic">Awaiting Palette</p>
                                 </div>
                               )}
                             </div>
                          )}
                       </AnimatePresence>

                       {/* Card Overlay */}
                       <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity"></div>
                       
                       <div className="absolute bottom-0 left-0 right-0 p-8 text-white z-20">
                          <h4 className="font-display text-2xl mb-1 italic">
                            {getOutfitLabel(outfit.type)}
                          </h4>
                          <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-brand-gold/90">Curated Context</p>
                       </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Expanded Modal */}
      <AnimatePresence>
        {isModalOpen && selectedOutfitIdx !== null && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/60 backdrop-blur-xl"
            onClick={() => setIsModalOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="bg-white w-full max-w-6xl h-full max-h-[90vh] rounded-[48px] overflow-hidden flex flex-col lg:flex-row shadow-2xl relative"
              onClick={e => e.stopPropagation()}
            >
               <button 
                onClick={() => setIsModalOpen(false)}
                className="absolute top-8 right-8 z-20 w-12 h-12 rounded-full bg-white/20 backdrop-blur-md text-white hover:bg-white hover:text-black transition-all flex items-center justify-center"
               >
                 <ArrowRight className="w-5 h-5 rotate-180" />
               </button>

               {(() => {
                 const outfit = result!.outfits[selectedOutfitIdx];
                 return (
                   <>
                    <div 
                      ref={el => outfitRefs.current[outfit.type] = el}
                      className="w-full lg:w-1/2 h-[50vh] lg:h-full bg-brand-bg relative overflow-hidden"
                    >
                      <AnimatePresence mode="wait">
                        <motion.div
                          key={outfit.modelImage ? 'model' : 'flat'}
                          initial={{ opacity: 0, scale: 0.95 }}
                          animate={{ opacity: 1, scale: 1 }}
                          className="w-full h-full flex items-center justify-center p-8 bg-brand-black/[0.02]"
                        >
                          <img 
                            src={outfit.modelImage || outfit.image} 
                            className={`max-w-full max-h-full rounded-2xl shadow-xl ${outfit.modelImage ? 'object-contain' : 'object-cover h-full w-full'}`} 
                          />
                        </motion.div>
                      </AnimatePresence>
                      
                      <div className="absolute bottom-8 left-8 right-8 flex justify-between items-center z-10">
                         <div className="flex gap-2">
                           <button 
                            disabled={generatingModels[outfit.type]}
                            onClick={(e) => { e.stopPropagation(); generateModelView(outfit); }}
                            className={`px-4 py-2 rounded-full backdrop-blur-md text-[9px] font-bold uppercase tracking-widest transition-all ${outfit.modelImage ? 'bg-brand-gold text-white' : 'bg-white/20 text-white hover:bg-white/40'}`}
                           >
                             {generatingModels[outfit.type] ? 'Styling Presence...' : errors[outfit.type]?.type === 'model' ? 'Retry Transformation' : 'Experience Transformation'}
                           </button>
                           <button 
                            disabled={generatingModels[outfit.type]}
                            onClick={(e) => { e.stopPropagation(); setResult(prev => ({...prev!, outfits: prev!.outfits.map(o => o.type === outfit.type ? {...o, modelImage: undefined} : o)})); }}
                            className={`px-4 py-2 rounded-full backdrop-blur-md text-[9px] font-bold uppercase tracking-widest transition-all ${!outfit.modelImage ? 'bg-brand-gold text-white' : 'bg-white/20 text-white hover:bg-white/40'}`}
                           >
                             Flat-lay
                           </button>
                         </div>
                         <button 
                          onClick={() => handleWearNow(outfit.type)}
                          className="w-10 h-10 rounded-full bg-white text-black flex items-center justify-center shadow-lg hover:scale-110 transition-transform"
                         >
                           <Download className="w-4 h-4" />
                         </button>
                      </div>
                    </div>

                    <div className="w-full lg:w-1/2 p-16 flex flex-col justify-center overflow-y-auto bg-white">
                      <div className="mb-12">
                        <span className="text-[11px] font-bold uppercase tracking-[0.6em] text-brand-gold mb-4 block italic">Exclusive {getOutfitLabel(outfit.type)}</span>
                        <h2 className="text-6xl font-display text-brand-black leading-[0.9] italic mb-8">
                           The <span className="text-brand-gold">Aura</span> of Perfection
                        </h2>
                        <div className="h-[2px] w-16 bg-brand-gold/20 mb-10"></div>
                        <p className="text-md font-medium text-brand-black/50 leading-relaxed italic pr-12">
                          {outfit.description}
                        </p>
                      </div>

                      <div className="space-y-6">
                         <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-brand-black border-b border-brand-gold/10 pb-4 italic">Composition</h4>
                         <ul className="grid grid-cols-2 gap-4">
                           {outfit.pieces.map((piece, i) => (
                             <motion.li 
                              initial={{ opacity: 0, x: -10 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.1 }}
                              key={piece} 
                              className="text-[11px] font-bold uppercase tracking-widest text-brand-black/40 flex items-center gap-3"
                             >
                               <div className="w-1.5 h-1.5 rounded-full bg-brand-gold/20" />
                               {piece}
                             </motion.li>
                           ))}
                         </ul>
                      </div>

                      <div className="mt-12 flex gap-4">
                         {result!.styleTags.slice(0, 4).map(tag => (
                           <span key={tag} className="text-[8px] font-bold border border-brand-gold/20 text-brand-gold px-3 py-1.5 rounded-full uppercase tracking-tighter">
                             #{tag}
                           </span>
                         ))}
                      </div>
                    </div>
                   </>
                 );
               })()}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <footer className="mt-auto py-12 flex flex-col items-center gap-6 border-t border-brand-accent/5">
        <div className="flex items-center gap-4">
          <div className="h-[1px] w-16 bg-brand-gold/20"></div>
          <Sparkles className="w-5 h-5 text-brand-gold" />
          <div className="h-[1px] w-16 bg-brand-gold/20"></div>
        </div>
        <p className="text-[10px] font-bold uppercase tracking-[0.4em] text-brand-black/30 italic">
          build with ❤️ by <span className="text-brand-black">Aravind S Gudi</span>
        </p>
      </footer>
    </div>
  );
}
