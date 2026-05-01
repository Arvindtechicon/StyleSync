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
  const [errors, setErrors] = useState<Record<string, string | null>>({});
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
      
      // Auto-trigger image generation for the first outfit
      if (data.outfits.length > 0) {
        generateImage(data.outfits[0]);
      }
    } catch (error) {
      console.error("Analysis failed:", error);
      if ((error as Error).message === "QUOTA_EXCEEDED") {
        setErrors(prev => ({ ...prev, global: "The fashion studio is currently at capacity. Please try again in 60 seconds." }));
      } else {
        setErrors(prev => ({ ...prev, global: "Failed to analyze image. Please try again." }));
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
      console.error("Image generation failed:", error);
      if ((error as Error).message === "QUOTA_EXCEEDED") {
        setErrors(prev => ({ ...prev, [outfit.type]: "Quota Reached. Please try again in 60 seconds." }));
      }
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
      console.error("Model image generation failed:", error);
      if ((error as Error).message === "QUOTA_EXCEEDED") {
        setErrors(prev => ({ ...prev, [outfit.type]: "Quota Reached. Try again shortly." }));
      }
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

  return (
    <div className="min-h-screen px-4 py-12 md:px-8 max-w-[1400px] mx-auto transition-colors duration-1000">
      <div className="flex flex-col items-center mb-16 text-center space-y-6">
        <motion.div 
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          className="flex flex-col items-center space-y-2"
        >
          <span className="text-[10px] md:text-[11px] font-bold uppercase tracking-[0.3em] text-brand-gold/60 mb-2">AI-Powered Styling for Premium Fashion</span>
          <h1 className="text-5xl md:text-7xl font-display leading-[1.1] text-brand-black">
            Elegance, <span className="italic text-brand-gold gold-glow">perfected.</span>
          </h1>
        </motion.div>

        <div className="segmented-control">
          <button 
            onClick={() => setImage(null)} 
            className="segmented-item segmented-item-active"
          >
            Standard
          </button>
          <button 
            className="segmented-item text-black/40 hover:text-black transition-colors"
          >
            Couture Mode
          </button>
        </div>

        <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-black/40">Use professional studio analysis</p>
      </div>

      <div className="grid grid-cols-12 gap-8">
        {/* Input Column */}
        <section className={`${result ? "col-span-12 lg:col-span-12 max-w-4xl mx-auto w-full" : "col-span-12 max-w-3xl mx-auto w-full"} transition-all duration-700`}>
          {!result ? (
            <div className="luxury-card h-[400px] md:h-[500px] flex flex-col bg-white border border-brand-gold/5">
              <div className="relative flex-1 bg-white flex flex-col items-center justify-center p-8 group overflow-hidden">
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
                            <p className="text-[11px] font-medium text-black/60 italic">{errors.global}</p>
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
          ) : (
            <div className="flex flex-col items-center mb-12">
               <div className="luxury-card p-2 bg-white ring-1 ring-brand-gold/5 max-w-[120px] mb-8">
                 <img src={image} alt="Ref" className="w-full aspect-square object-cover rounded-[32px]" />
               </div>
               <div className="text-center max-w-2xl">
                 <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-brand-gold mb-4 inline-block">Curated Analysis</span>
                 <h2 className="text-3xl font-display text-brand-black mb-4 capitalize">{result.itemDescription}</h2>
                 <div className="flex justify-center gap-3">
                   {result.styleTags.map(tag => (
                     <span key={tag} className="px-4 py-1 rounded-full bg-white border border-brand-gold/10 text-[9px] font-bold uppercase tracking-wider text-brand-black/60 italic">#{tag}</span>
                   ))}
                 </div>
               </div>
            </div>
          )}
        </section>

        {/* Results Sections */}
        {result && (
          <section className="col-span-12 grid grid-cols-1 md:grid-cols-3 gap-8 mt-8">
            <AnimatePresence mode="popLayout">
              {result.outfits.map((outfit, idx) => (
                <motion.div 
                  key={outfit.type}
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.2 }}
                  className="luxury-card bg-white p-8 group flex flex-col h-full"
                >
                  <div className="space-y-6 flex-1 flex flex-col">
                    <div className="flex justify-between items-start">
                      <span className="px-5 py-1.5 rounded-full bg-brand-bg text-brand-gold text-[9px] font-black uppercase tracking-[0.2em] italic">
                        {outfit.type === "Casual" ? "Daywear" : outfit.type === "Business" ? "Elite" : "Gala"}
                      </span>
                      <div className="flex gap-2">
                         <button 
                            onClick={() => handleWearNow(outfit.type)}
                            className="p-2 rounded-full border border-brand-gold/10 text-brand-gold hover:bg-brand-gold hover:text-white transition-all"
                            title="Download Look"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                       <h3 className="font-display text-3xl text-brand-black leading-tight">
                         {outfit.type === "Casual" ? "Curated Casual" : outfit.type === "Business" ? "The Atelier" : "Nocturnal Glow"}
                       </h3>
                       <p className="text-[12px] text-brand-black/50 leading-relaxed font-medium line-clamp-3 italic">
                         {outfit.description}
                       </p>
                    </div>

                    <div 
                      ref={el => outfitRefs.current[outfit.type] = el}
                      className="relative aspect-[3/4] rounded-[32px] overflow-hidden bg-brand-bg ring-1 ring-brand-gold/5 mt-auto"
                    >
                      <AnimatePresence mode="wait">
                        {outfit.modelImage ? (
                          <motion.div 
                            key="model"
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }} 
                            exit={{ opacity: 0 }}
                            className="w-full h-full"
                          >
                            <img src={outfit.modelImage} alt="Model wear" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </motion.div>
                        ) : outfit.image ? (
                          <motion.div 
                            key="flat"
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }} 
                            exit={{ opacity: 0 }}
                            className="w-full h-full relative group/img cursor-pointer"
                            onClick={() => generateModelView(outfit)}
                          >
                            <img src={outfit.image} alt={outfit.type} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <div className="absolute inset-0 bg-brand-gold/80 opacity-0 group-hover/img:opacity-100 transition-opacity flex flex-col items-center justify-center p-8 text-white text-center">
                              <Camera className="w-8 h-8 mb-4 opacity-70" />
                              <p className="text-[11px] font-bold uppercase tracking-widest mb-4">View on Professional Model</p>
                              <ul className="text-[10px] font-medium uppercase tracking-wider space-y-1">
                                {outfit.pieces.map(p => <li key={p}>{p}</li>)}
                              </ul>
                            </div>
                          </motion.div>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center p-4">
                            {generatingImages[outfit.type] || generatingModels[outfit.type] ? (
                              <div className="flex flex-col items-center gap-4">
                                <div className="w-8 h-8 border-2 border-brand-gold border-t-white rounded-full animate-spin" />
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-gold">Designing Look...</span>
                              </div>
                            ) : errors[outfit.type] ? (
                              <div className="flex flex-col items-center gap-4 text-center px-6">
                                <RefreshCw className="w-6 h-6 text-brand-gold/40" />
                                <div className="space-y-1">
                                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-gold">Studio Busy</p>
                                  <p className="text-[9px] font-medium text-black/40 italic">{errors[outfit.type]}</p>
                                </div>
                                <button 
                                  onClick={() => generateImage(outfit)}
                                  className="text-[9px] font-bold uppercase tracking-widest text-brand-gold border-b border-brand-gold/30 pb-0.5 hover:border-brand-gold transition-all"
                                >
                                  Retry Analysis
                                </button>
                              </div>
                            ) : (
                              <button 
                                onClick={() => generateImage(outfit)}
                                className="group/btn flex flex-col items-center gap-4 hover:scale-105 transition-transform"
                              >
                                <div className="w-16 h-16 rounded-full bg-white shadow-lg flex items-center justify-center text-brand-gold group-hover/btn:bg-brand-gold group-hover/btn:text-white transition-all">
                                  <Layers className="w-6 h-6" />
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-black/40">Assemble Palette</span>
                              </button>
                            )}
                          </div>
                        )}
                      </AnimatePresence>
                    </div>

                    <div className="flex items-center justify-between pt-4">
                        <button 
                          onClick={() => {
                            setResult(prev => {
                              if (!prev) return null;
                              return {
                                ...prev,
                                outfits: prev.outfits.map(o => 
                                  o.type === outfit.type ? { ...o, modelImage: undefined } : o
                                )
                              };
                            });
                          }}
                          className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${!outfit.modelImage ? 'text-brand-gold' : 'text-black/30 hover:text-black'}`}
                        >
                          Flat-lay
                        </button>
                        <button 
                          onClick={() => generateModelView(outfit)}
                          className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${outfit.modelImage ? 'text-brand-gold' : 'text-black/30 hover:text-black'}`}
                        >
                          Editorial
                        </button>
                    </div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </section>
        )}
      </div>

      {result && (
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mt-24 text-center pb-12"
        >
          <button 
             onClick={() => { setImage(null); setResult(null); }}
             className="text-brand-gold text-[11px] font-bold uppercase tracking-[0.4em] hover:opacity-70 transition-opacity flex items-center gap-4 mx-auto"
          >
            <div className="h-[1px] w-12 bg-brand-gold/30"></div>
            Return to Collection
            <div className="h-[1px] w-12 bg-brand-gold/30"></div>
          </button>
        </motion.div>
      )}
    </div>
  );
}
