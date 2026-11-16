"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import learnEarth from "@/assets/learn-earth.jpg";
import learnIct from "@/assets/learn-ict.jpg";
import learnDna from "@/assets/learn-dna.jpg";
import learnWater from "@/assets/learn-water.jpg";

const SLIDES = [
  {
    src: learnEarth,
    alt: "A student at his classroom desk with a 3D Earth rising from his open book, Tanzania marked",
    position: "object-[40%_45%]",
  },
  {
    src: learnIct,
    alt: "Two students smile at a phone as a 3D CPU rises from it, with the CPU and its circuit board labelled",
    position: "object-[40%_45%]",
  },
  {
    src: learnDna,
    alt: "A student at a library desk with a 3D DNA double helix standing over her books, the backbone and a base pair labelled",
    position: "object-[40%_45%]",
  },
  {
    src: learnWater,
    alt: "A student working at his desk beside a 3D water molecule, with oxygen and hydrogen labelled",
    position: "object-[40%_45%]",
  },
];

const EVERY_MS = 5000;

export function ArShowcase({ className = "", sizes }: { className?: string; sizes: string }) {
  const [at, setAt] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setAt((i) => (i + 1) % SLIDES.length), EVERY_MS);
    return () => window.clearInterval(timer);
  }, [at]);

  return (
    <figure aria-roledescription="carousel" className={`relative overflow-hidden bg-[#dfe3e8] ${className}`}>
      {SLIDES.map((slide, i) => (
        <Image
          key={slide.alt}
          src={slide.src}
          alt={i === at ? slide.alt : ""}
          aria-hidden={i !== at}
          fill
          priority={i === 0}
          placeholder="blur"
          sizes={sizes}
          className={`object-cover ${slide.position} transition-opacity duration-1000 ease-in-out ${i === at ? "opacity-100" : "opacity-0"}`}
        />
      ))}
      <div className="absolute bottom-5 left-1/2 flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[rgba(10,33,56,0.32)] px-2.5 py-2 backdrop-blur-md">
        {SLIDES.map((slide, i) => (
          <button
            key={slide.alt}
            type="button"
            aria-label={`Show picture ${i + 1} of ${SLIDES.length}`}
            aria-current={i === at}
            onClick={() => setAt(i)}
            className={`h-1.5 rounded-full transition-all duration-300 ${i === at ? "w-6 bg-white" : "w-1.5 bg-white/55 hover:bg-white/80"}`}
          />
        ))}
      </div>
    </figure>
  );
}
