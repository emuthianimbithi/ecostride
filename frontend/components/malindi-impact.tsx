"use client"

import { motion } from "framer-motion"
import { type ReactNode } from "react"

type Pillar = { title: string; desc: string; icon: ReactNode }

const PILLARS: Pillar[] = [
  {
    title: "Clean",
    desc: "Organising weekly community beach cleanups along the Kenyan coast — removing plastic before it reaches the deep ocean.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
      />
    )
  },
  {
    title: "Educate",
    desc: "Partnering with local schools in Malindi to teach the next generation about marine conservation and sustainable living.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
      />
    )
  },
  {
    title: "Protect",
    desc: "Safeguarding sea-turtle nesting grounds and restoring vital coral reef habitats along the shoreline.",
    icon: (
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
        d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
      />
    )
  }
]

export function MalindiImpact() {
  return (
    <div className="w-full bg-sand-100 py-24 px-6 md:px-16 relative">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-16">
          <p className="font-body text-sand-700 tracking-[0.24em] uppercase text-sm font-bold mb-3">
            Preserving the beauty of Kenya&apos;s coast
          </p>
          <h3 className="font-display text-4xl md:text-5xl text-forest-800 font-bold">
            Our mission
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {PILLARS.map((pillar, i) => (
            <motion.div
              key={pillar.title}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-50px" }}
              transition={{ duration: 0.6, delay: i * 0.2 }}
              className="bg-sand-200/60 p-10 rounded-2xl border border-sand-500/25 hover:bg-sand-200 transition-colors duration-500 group"
            >
              <div className="w-14 h-14 rounded-full bg-sand-700/10 flex items-center justify-center mb-6 group-hover:bg-sand-700 transition-colors duration-500">
                <svg
                  className="w-7 h-7 text-sand-700 group-hover:text-sand-50 transition-colors duration-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  {pillar.icon}
                </svg>
              </div>
              <h4 className="font-display text-2xl text-forest-800 font-bold mb-3">{pillar.title}</h4>
              <p className="font-body text-forest-600/85 leading-relaxed">{pillar.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  )
}
