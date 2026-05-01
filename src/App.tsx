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
  const [mode, setMode] = useState<"ordinary" | "custom">("ordinary");
  const [image, setImage] = useState<string | null>(null);
  const [outfitImage, setOutfitImage] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [generatingImages, setGeneratingImages] = useState<Record<string, boolean>>({});
  const [generatingModels, setGeneratingModels] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const outfitInputRef = useRef<HTMLInputElement>(null);
  const outfitRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: "user" | "outfit") => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === "user") {
          setImage(reader.result as string);
        } else {
          setOutfitImage(reader.result as string);
        }
        setResult(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const startAnalysis = async () => {
    if (!image) return;
    if (mode === "custom" && !outfitImage) {
      alert("Please upload the outfit you want to try on.");
      return;
    }

    setAnalyzing(true);
    try {
      const base64Data = image.split(",")[1];
      const mimeType = image.split(";")[0].split(":")[1];
      
      let customOutfit = undefined;
      if (mode === "custom" && outfitImage) {
        customOutfit = {
          data: outfitImage.split(",")[1],
          mime: outfitImage.split(";")[0].split(":")[1]
        };
      }

      const data = await analyzeItem(base64Data, mimeType, customOutfit);
      setResult(data);
      
      if (data.outfits.length > 0) {
        if (mode === "custom") {
          generateModelView(data.outfits[0]);
        } else {
          generateImage(data.outfits[0]);
        }
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
    } catch (error: any) {
      console.error("Image generation failed:", error);
      if (error.message === "QUOTA_EXHAUSTED") {
        alert("The AI image generation limit has been reached. Please wait a minute and try again.");
      } else if (error.message === "IMAGE_SAFETY_BLOCKED") {
        alert("This generation was blocked by safety filters.");
      } else {
        alert("Failed to generate image. Please try again.");
      }
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
    } catch (error: any) {
      console.error("Model image generation failed:", error);
      if (error.message === "QUOTA_EXHAUSTED") {
        alert("The AI visualization limit has been reached. Please wait a minute.");
      } else if (error.message === "IMAGE_SAFETY_BLOCKED") {
        alert("This editorial view was blocked by safety filters.");
      } else {
        alert("Failed to generate editorial view. Please try again.");
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
              onClick={() => { setImage(null); setOutfitImage(null); setResult(null); }}
              className="bg-black text-white px-6 py-2 rounded-full text-xs font-bold hover:bg-zinc-800 transition-colors uppercase tracking-widest"
            >
              New Scan
            </button>
          </div>
        </header>

        {/* Input Column */}
        <section className={`${result ? "col-span-12 lg:col-span-5" : "col-span-12"} transition-all duration-500`}>
          <div className="bento-card h-full flex flex-col bg-white">
            <div className="p-6 border-b border-black/5 flex flex-col md:flex-row justify-between items-center gap-4">
              <span className="text-[10px] font-bold uppercase tracking-widest text-black/40">Analysis Mode</span>
              <div className="flex bg-black/5 p-1 rounded-full border border-black/5">
                <button 
                  onClick={() => { setMode("ordinary"); setResult(null); }}
                  className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all ${mode === "ordinary" ? "bg-white shadow-sm text-black" : "text-black/40 hover:text-black/60"}`}
                >
                  Ordinary
                </button>
                <button 
                  onClick={() => { setMode("custom"); setResult(null); }}
                  className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase transition-all ${mode === "custom" ? "bg-white shadow-sm text-black" : "text-black/40 hover:text-black/60"}`}
                >
                  Custom Outfit
                </button>
              </div>
            </div>

            <div className={`relative flex-1 ${result ? "min-h-[400px]" : "min-h-[60vh]"} bg-[#EEEEEA] p-8 group overflow-hidden flex items-center justify-center`}>
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={(e) => handleFileUpload(e, "user")}
                accept="image/*"
                className="hidden"
              />
              <input 
                type="file" 
                ref={outfitInputRef}
                onChange={(e) => handleFileUpload(e, "outfit")}
                accept="image/*"
                className="hidden"
              />
              
              <div className={`grid w-full h-full gap-8 ${mode === "custom" ? "grid-cols-2" : "grid-cols-1"}`}>
                {/* User Photo Box */}
                <div 
                  onClick={() => fileInputRef.current?.click()}
                  className={`relative flex items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden ${!image ? "border-black/10 hover:border-black/30 hover:bg-white/50" : "border-transparent shadow-xl border-8 border-white"}`}
                >
                  {!image ? (
                    <div className="flex flex-col items-center gap-4 text-center p-4">
                      <div className="w-16 h-16 rounded-full bg-white shadow flex items-center justify-center">
                        <Camera className="w-6 h-6 text-black/20" />
                      </div>
                      <div>
                        <p className="font-display font-bold text-sm tracking-tight uppercase">User Photo</p>
                        <p className="text-black/40 text-[9px] font-medium uppercase leading-tight mt-1">Full body photo preferred</p>
                      </div>
                    </div>
                  ) : (
                    <img src={image} alt="User" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  )}
                  {analyzing && image && (
                    <motion.div 
                      initial={{ top: "-10%" }}
                      animate={{ top: "110%" }}
                      transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                      className="scanner-beam z-20"
                    />
                  )}
                </div>

                {/* Outfit Photo Box (Custom Mode Only) */}
                {mode === "custom" && (
                  <div 
                    onClick={() => outfitInputRef.current?.click()}
                    className={`relative flex items-center justify-center rounded-2xl border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden ${!outfitImage ? "border-black/10 hover:border-black/30 hover:bg-white/50" : "border-transparent shadow-xl border-8 border-white"}`}
                  >
                    {!outfitImage ? (
                      <div className="flex flex-col items-center gap-4 text-center p-4">
                        <div className="w-16 h-16 rounded-full bg-white shadow flex items-center justify-center">
                          <Upload className="w-6 h-6 text-black/20" />
                        </div>
                        <div>
                          <p className="font-display font-bold text-sm tracking-tight uppercase">Target Outfit</p>
                          <p className="text-black/40 text-[9px] font-medium uppercase leading-tight mt-1">Product image or screenshot</p>
                        </div>
                      </div>
                    ) : (
                      <img src={outfitImage} alt="Outfit" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    )}
                  </div>
                )}
              </div>

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
            </div>

            {image && (mode === "ordinary" || outfitImage) && !result && (
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
