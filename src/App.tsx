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
      alert("Failed to analyze image. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  const generateImage = async (outfit: OutfitRecommendation) => {
    if (outfit.image || generatingImages[outfit.type] || !image) return;

    setGeneratingImages(prev => ({ ...prev, [outfit.type]: true }));
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
    } finally {
      setGeneratingImages(prev => ({ ...prev, [outfit.type]: false }));
    }
  };

  const generateModelView = async (outfit: OutfitRecommendation) => {
    if (outfit.modelImage || generatingModels[outfit.type] || !image) return;

    setGeneratingModels(prev => ({ ...prev, [outfit.type]: true }));
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
    <div className="min-h-screen p-6 max-w-[1440px] mx-auto overflow-hidden">
      <div className="grid grid-cols-12 auto-rows-min gap-4 h-full">
        {/* Header Section */}
        <header className="col-span-12 bento-card flex items-center justify-between px-8 py-6 bg-white">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-black rounded-lg flex items-center justify-center">
              <div className="w-4 h-4 border-2 border-white rotate-45"></div>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tighter uppercase">VogueAI Stylist</h1>
              <p className="text-[10px] uppercase tracking-widest text-black/40 font-semibold">AI Personal Shopper</p>
            </div>
          </div>
          
          <div className="flex gap-6 items-center">
            {result && (
              <div className="text-right hidden md:block">
                <p className="text-[10px] font-bold uppercase tracking-widest text-black/40">Analyzing Style</p>
                <p className="text-xs font-semibold text-brand-business truncate max-w-[200px]">{result.itemDescription}</p>
              </div>
            )}
            <button 
              onClick={() => { setImage(null); setResult(null); }}
              className="bg-black text-white px-6 py-2 rounded-full text-xs font-bold hover:bg-zinc-800 transition-colors uppercase tracking-widest"
            >
              New Scan
            </button>
          </div>
        </header>

        {/* Input Column */}
        <section className={`${result ? "col-span-12 lg:col-span-5" : "col-span-12"} transition-all duration-500`}>
          <div className="bento-card h-full flex flex-col bg-white">
            <div className="p-6 border-b border-black/5 flex justify-between items-center">
              <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">Input Source</span>
              {image && (
                <span className="px-3 py-1 bg-brand-business/10 text-brand-business rounded-full text-[10px] font-bold uppercase">
                  Verified Texture
                </span>
              )}
            </div>

            <div className={`relative flex-1 ${result ? "min-h-[400px]" : "min-h-[60vh]"} bg-[#EEEEEA] flex items-center justify-center p-8 group overflow-hidden`}>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileUpload}
                accept="image/*"
                className="hidden"
              />
              
              {!image ? (
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center gap-4 cursor-pointer hover:scale-105 transition-transform duration-500"
                >
                  <div className="w-20 h-20 rounded-full bg-white shadow-xl flex items-center justify-center group-hover:bg-black transition-colors">
                    <Camera className="w-8 h-8 text-black/20 group-hover:text-white" />
                  </div>
                  <div className="text-center">
                    <p className="font-display font-bold text-xl tracking-tight uppercase">Analyze Your Style</p>
                    <p className="text-black/40 text-[11px] font-medium uppercase tracking-widest">Upload your photo for a total makeover</p>
                  </div>
                </div>
              ) : (
                <div className="relative w-full h-full flex items-center justify-center">
                  <motion.div 
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="relative z-10 w-full max-w-sm aspect-[3/4] rounded-2xl shadow-2xl overflow-hidden border-8 border-white"
                  >
                    <img src={image} alt="Source" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    {analyzing && (
                      <motion.div 
                        initial={{ top: "-10%" }}
                        animate={{ top: "110%" }}
                        transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                        className="scanner-beam z-20"
                        style={{ background: 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.5), transparent)' }}
                      />
                    )}
                  </motion.div>

                  {result && (
                    <motion.div 
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md p-4 rounded-xl border border-white/50 shadow-lg z-20"
                    >
                      <div className="flex gap-2 mb-2 flex-wrap">
                        {result.styleTags.slice(0, 3).map(tag => (
                          <span key={tag} className="text-[9px] font-bold uppercase tracking-widest text-black/40 italic">#{tag}</span>
                        ))}
                      </div>
                      <p className="text-[11px] font-bold leading-tight line-clamp-2">{result.itemDescription}</p>
                    </motion.div>
                  )}

                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="absolute top-4 right-4 bg-white/20 hover:bg-white/40 backdrop-blur p-2 rounded-full transition-colors z-20"
                  >
                    <RefreshCw className="w-4 h-4 text-black" />
                  </button>
                </div>
              )}
            </div>

            {image && !result && (
              <div className="p-6 bg-white">
                <motion.button
                  onClick={startAnalysis}
                  disabled={analyzing}
                  className="w-full bg-black text-white h-14 rounded-2xl font-bold uppercase tracking-widest flex items-center justify-center gap-3 hover:bg-zinc-800 disabled:opacity-50 transition-all shadow-lg"
                >
                  {analyzing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      <span>Synthesizing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5 text-brand-business" />
                      <span>Start Style Analysis</span>
                    </>
                  )}
                </motion.button>
              </div>
            )}
          </div>
        </section>

        {/* Results Sections */}
        {!result ? (
          <section className="col-span-12 lg:col-span-7 flex flex-col gap-4">
            <div className="bento-card flex-1 bg-white p-12 flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-24 h-24 border-2 border-dashed border-black/10 rounded-3xl flex items-center justify-center text-black/10">
                <Layers className="w-12 h-12" />
              </div>
              <div>
                <h2 className="text-3xl font-display font-bold uppercase tracking-tighter">Personal Style Curation</h2>
                <p className="text-black/40 max-w-xs mx-auto mt-2 font-medium">Upload a full photo to see our AI generate three distinct, complementary style paths for you.</p>
              </div>
            </div>
          </section>
        ) : (
          <section className="col-span-12 lg:col-span-7 flex flex-col gap-4">
            {result.outfits.map((outfit, idx) => {
              const themeColor = outfit.type === "Casual" ? "text-[#3B82F6]" : outfit.type === "Business" ? "text-[#10B981]" : "text-[#F43F5E]";
              const bgColor = outfit.type === "Casual" ? "bg-[#EFF6FF]" : outfit.type === "Business" ? "bg-[#ECFDF5]" : "bg-[#141416]";
              const isDark = outfit.type === "Night Out";

              return (
                <motion.div 
                  key={outfit.type}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className={`bento-card ${bgColor} ${isDark ? 'text-white' : 'text-black'} p-6 flex flex-col md:flex-row gap-6 shadow-sm`}
                >
                  <div className={`md:w-1/3 flex flex-col justify-center ${isDark ? 'border-white/10' : 'border-black/5'} md:border-r md:pr-6`}>
                    <div className={`${themeColor} ${idx === 2 ? 'bg-rose-500 text-white' : 'bg-white/50 backdrop-blur'} w-fit px-3 py-1 rounded-full text-[9px] font-black uppercase mb-3 italic tracking-widest`}>
                      {outfit.type}
                    </div>
                    <h3 className="font-bold text-xl leading-tight uppercase tracking-tighter mb-2">{outfit.type === "Casual" ? "Weekend Flow" : outfit.type === "Business" ? "Professional Pulse" : "Rooftop Soirée"}</h3>
                    <p className={`text-[11px] ${isDark ? 'text-white/60' : 'text-black/50'} leading-relaxed font-medium`}>{outfit.description}</p>
                  </div>
                  
                  <div className="flex-1 flex flex-col gap-4">
                    <div className="flex gap-4 items-center justify-between">
                      <div className="flex gap-2">
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
                          className={`px-4 py-1.5 rounded-full text-[10px] font-bold transition-all ${!outfit.modelImage && !generatingModels[outfit.type] ? 'bg-black text-white' : 'bg-black/5 text-black hover:bg-black/10'}`}
                        >
                          Flat-lay
                        </button>
                        <button 
                          onClick={() => generateModelView(outfit)}
                          className={`px-4 py-1.5 rounded-full text-[10px] font-bold transition-all flex items-center gap-2 ${outfit.modelImage ? 'bg-brand-business text-white' : 'bg-black/5 text-black hover:bg-black/10'}`}
                        >
                          {generatingModels[outfit.type] ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Camera className="w-3 h-3" />}
                          {outfit.modelImage ? 'Editorial Ready' : 'Editorial View'}
                        </button>
                      </div>

                      {(outfit.image || outfit.modelImage) && (
                        <button 
                          onClick={() => handleWearNow(outfit.type)}
                          className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full transition-all border border-current hover:bg-current hover:invert`}
                        >
                          <Download className="w-3 h-3" />
                          Wear Now
                        </button>
                      )}
                    </div>

                    <div 
                      ref={el => outfitRefs.current[outfit.type] = el}
                      className="flex-1 flex gap-4 overflow-hidden relative min-h-[220px]"
                    >
                      <AnimatePresence mode="wait">
                        {outfit.modelImage ? (
                          <motion.div 
                            key="model"
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }} 
                            exit={{ opacity: 0 }}
                            className="w-full h-full rounded-2xl overflow-hidden shadow-inner bg-black/5"
                          >
                            <img src={outfit.modelImage} alt="Model wear" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                          </motion.div>
                        ) : outfit.image ? (
                          <motion.div 
                            key="flat"
                            initial={{ opacity: 0 }} 
                            animate={{ opacity: 1 }} 
                            exit={{ opacity: 0 }}
                            className="w-full h-full relative rounded-2xl overflow-hidden group/img shrink-0"
                          >
                            <img src={outfit.image} alt={outfit.type} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                            <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center p-4">
                              <ul className="text-[10px] font-bold uppercase tracking-widest text-center space-y-1">
                                {outfit.pieces.map(p => <li key={p}>{p}</li>)}
                              </ul>
                            </div>
                          </motion.div>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center bg-white/5 rounded-2xl border border-white/10 border-dashed">
                            {generatingImages[outfit.type] || generatingModels[outfit.type] ? (
                              <div className="flex flex-col items-center gap-2">
                                <div className="w-6 h-6 border-2 border-brand-business border-t-white rounded-full animate-spin" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Designing...</span>
                              </div>
                            ) : (
                              <button 
                                onClick={() => generateImage(outfit)}
                                className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all hover:scale-105 ${isDark ? 'bg-white text-black' : 'bg-black text-white'}`}
                              >
                                Visualize Ensemble
                              </button>
                            )}
                          </div>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </section>
        )}
      </div>
    </div>
  );
}
