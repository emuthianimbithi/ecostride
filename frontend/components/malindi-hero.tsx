"use client"

import { useEffect, useState, type MouseEvent as ReactMouseEvent } from "react"
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform
} from "framer-motion"

type Scene = {
  id: string
  label: string
  headline: string
  tagline: string
}

const SCENES: Scene[] = [
  {
    id: "crisis",
    label: "The Crisis",
    headline: "Clean Our Shores",
    tagline: "Every piece of plastic removed is a step toward healing our ocean edge."
  },
  {
    id: "movement",
    label: "The Movement",
    headline: "Stronger Together",
    tagline: "Runners, crews, schools, and neighbours can transform a coastline together."
  },
  {
    id: "challenge",
    label: "The Challenge",
    headline: "Chart the Course",
    tagline: "Map a route from polluted shoreline to protected estuary and cleaner beaches."
  },
  {
    id: "race",
    label: "The Race",
    headline: "Race to Restore",
    tagline: "Every stride backs a cleaner shore, stronger habitat, and better race morning."
  }
]

const SCENE_DURATION = 6000

export function MalindiHero({
  primaryLabel = "Join the movement"
}: {
  primaryLabel?: string
}) {
  const [activeScene, setActiveScene] = useState(0)
  const [isLoaded, setIsLoaded] = useState(false)
  const [hasEntered, setHasEntered] = useState(false)

  const mouseX = useMotionValue(0)
  const mouseY = useMotionValue(0)
  const springConfig = { damping: 40, stiffness: 100, mass: 0.5 }
  const smoothX = useSpring(mouseX, springConfig)
  const smoothY = useSpring(mouseY, springConfig)

  const skyX = useTransform(smoothX, (v) => v * 2)
  const skyY = useTransform(smoothY, (v) => v * 2)
  const sunX = useTransform(smoothX, (v) => v * 5)
  const sunY = useTransform(smoothY, (v) => v * 5)
  const backWaveX = useTransform(smoothX, (v) => v * -5)
  const backWaveY = useTransform(smoothY, (v) => v * -2)
  const midWaveX = useTransform(smoothX, (v) => v * -10)
  const midWaveY = useTransform(smoothY, (v) => v * -4)
  const frontWaveX = useTransform(smoothX, (v) => v * -15)
  const frontWaveY = useTransform(smoothY, (v) => v * -6)
  const sandX = useTransform(smoothX, (v) => v * -20)
  const sandY = useTransform(smoothY, (v) => v * -8)
  const palmX = useTransform(smoothX, (v) => v * -30)
  const palmY = useTransform(smoothY, (v) => v * -10)

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setIsLoaded(true))
    const enterTimer = window.setTimeout(() => setHasEntered(true), 2600)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(enterTimer)
    }
  }, [])

  useEffect(() => {
    if (!hasEntered) return
    const timer = setInterval(() => {
      setActiveScene((scene) => (scene + 1) % SCENES.length)
    }, SCENE_DURATION)
    return () => clearInterval(timer)
  }, [hasEntered])

  const handleMouseMove = (e: ReactMouseEvent<HTMLDivElement>) => {
    const { clientX, clientY } = e
    const { innerWidth, innerHeight } = window
    mouseX.set((clientX / innerWidth - 0.5) * 2)
    mouseY.set((clientY / innerHeight - 0.5) * 2)
  }

  const headlineWords = SCENES[activeScene].headline.split(" ")

  return (
    <div
      className="relative w-full h-[100svh] overflow-hidden bg-[#081522]"
      onMouseMove={handleMouseMove}
    >
      <style>{`
        @keyframes mh-sunPulse { 0%, 100% { r: 120; opacity: 1; } 50% { r: 125; opacity: 0.92; } }
        @keyframes mh-sunHaze { 0%, 100% { r: 160; opacity: 0.16; } 50% { r: 182; opacity: 0.09; } }
        @keyframes mh-rayRotate { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes mh-palmSwayL { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(3deg); } }
        @keyframes mh-palmSwayR { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-3deg); } }
        @keyframes mh-boatBob { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-4px) rotate(1deg); } }
        @keyframes mh-floatTrash { 0%, 100% { transform: translateY(0) rotate(0deg); } 50% { transform: translateY(-5px) rotate(5deg); } }
        @keyframes mh-walkSad { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-2px); } }
        @keyframes mh-bendPick { 0%, 20% { transform: rotate(0deg) translateY(0); } 40%, 60% { transform: rotate(25deg) translateY(8px); } 80%, 100% { transform: rotate(0deg) translateY(0); } }
        @keyframes mh-sparkleUp { 0% { opacity: 0.8; transform: translateY(0) scale(1); } 100% { opacity: 0; transform: translateY(-30px) scale(0.2); } }
        @keyframes mh-waterShimmer { 0%, 100% { opacity: 0.15; transform: translateX(0); } 50% { opacity: 0.28; transform: translateX(15px); } }
        @keyframes mh-pulseGlow { 0% { box-shadow: 0 0 18px rgba(233, 219, 193, 0.25); } 100% { box-shadow: 0 0 32px rgba(233, 219, 193, 0.45); } }
        @keyframes mh-runMotion { 0%, 100% { transform: translateY(0) rotate(0deg); } 25% { transform: translateY(-3px) rotate(2deg); } 50% { transform: translateY(0) rotate(0deg); } 75% { transform: translateY(-3px) rotate(-2deg); } }
        @keyframes mh-runTrail { 0% { opacity: 0.3; transform: translateX(0) scale(1); } 100% { opacity: 0; transform: translateX(-20px) scale(0.8); } }
        @keyframes mh-flagWave { 0%, 100% { transform: skewY(0deg); } 50% { transform: skewY(10deg); } }
      `}</style>

      <svg
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 block h-full w-full pointer-events-none"
      >
        <defs>
          <linearGradient id="mh-skyGrad" x1="720" y1="0" x2="720" y2="600" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#081522" />
            <stop offset="32%" stopColor="#14324A" />
            <stop offset="60%" stopColor="#2A536B" />
            <stop offset="84%" stopColor="#B8A487" />
            <stop offset="100%" stopColor="#F4E7D4" />
          </linearGradient>
          <linearGradient id="mh-waveBack" x1="720" y1="550" x2="720" y2="700" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#0E4457" />
            <stop offset="100%" stopColor="#145E73" />
          </linearGradient>
          <linearGradient id="mh-waveMid" x1="720" y1="600" x2="720" y2="750" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#1D6C80" />
            <stop offset="100%" stopColor="#2490A2" />
          </linearGradient>
          <linearGradient id="mh-waveFront" x1="720" y1="650" x2="720" y2="850" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#54ACB5" />
            <stop offset="100%" stopColor="#7BC5C7" />
          </linearGradient>
          <linearGradient id="mh-sandGrad" x1="720" y1="750" x2="720" y2="900" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#D2C0A4" />
            <stop offset="40%" stopColor="#E7D8C0" />
            <stop offset="100%" stopColor="#F5EBDD" />
          </linearGradient>
          <radialGradient id="mh-sunGlow" cx="720" cy="550" r="400" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#F6EAD5" stopOpacity="0.56" />
            <stop offset="32%" stopColor="#E0CCAC" stopOpacity="0.26" />
            <stop offset="100%" stopColor="#D2C0A4" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="mh-sunCore" cx="720" cy="550" r="120" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="30%" stopColor="#FFF6EA" />
            <stop offset="100%" stopColor="#E8D8BE" />
          </radialGradient>
          <filter id="mh-glow">
            <feGaussianBlur stdDeviation="15" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="mh-sandNoise">
            <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="5" />
            <feColorMatrix type="saturate" values="0" />
            <feComponentTransfer>
              <feFuncA type="linear" slope="0.08" />
            </feComponentTransfer>
            <feBlend in="SourceGraphic" mode="multiply" />
          </filter>
          <filter id="mh-dropShadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="10" stdDeviation="8" floodColor="#081522" floodOpacity="0.4" />
          </filter>
          <radialGradient id="mh-vignette" cx="50%" cy="50%" r="70%">
            <stop offset="50%" stopColor="transparent" />
            <stop offset="100%" stopColor="#081522" stopOpacity="0.6" />
          </radialGradient>
        </defs>

        <motion.rect
          width="1600"
          height="900"
          x="-80"
          fill="url(#mh-skyGrad)"
          style={{ x: skyX, y: skyY }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 2 }}
        />

        <motion.g
          style={{ x: sunX, y: sunY }}
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: isLoaded ? 1 : 0, y: isLoaded ? 0 : 50 }}
          transition={{ duration: 2.5, delay: 0.5, ease: "easeOut" }}
        >
          <g
            style={{
              transformOrigin: "720px 550px",
              animation: "mh-rayRotate 80s linear infinite",
              mixBlendMode: "overlay",
              opacity: 0.45
            }}
          >
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <polygon
                key={deg}
                points="720,550 200,-400 1240,-400"
                fill="url(#mh-sunGlow)"
                transform={`rotate(${deg} 720 550)`}
              />
            ))}
          </g>
          <circle cx="720" cy="550" r="400" fill="url(#mh-sunGlow)" />
          <circle
            cx="720"
            cy="550"
            r="120"
            fill="url(#mh-sunCore)"
            filter="url(#mh-glow)"
            style={{ animation: "mh-sunPulse 8s ease-in-out infinite" }}
          />
          <circle
            cx="720"
            cy="550"
            r="160"
            fill="none"
            stroke="#EEE0C7"
            strokeWidth="2"
            style={{ animation: "mh-sunHaze 8s ease-in-out infinite" }}
          />
        </motion.g>

        <motion.g
          style={{ x: backWaveX, y: backWaveY }}
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: isLoaded ? 1 : 0, y: isLoaded ? 0 : 30 }}
          transition={{ duration: 2, delay: 1 }}
        >
          <path fill="url(#mh-waveBack)">
            <animate
              attributeName="d"
              dur="8s"
              repeatCount="indefinite"
              values="M-100 580C140 560 380 550 620 570C860 590 1100 610 1340 590C1460 580 1540 560 1600 550V900H-100Z;M-100 570C140 590 380 600 620 580C860 560 1100 550 1340 570C1460 580 1540 600 1600 610V900H-100Z;M-100 580C140 560 380 550 620 570C860 590 1100 610 1340 590C1460 580 1540 560 1600 550V900H-100Z"
            />
          </path>
          <g
            style={{
              transformOrigin: "900px 560px",
              animation: "mh-boatBob 5s ease-in-out infinite"
            }}
            fill="#081522"
            opacity="0.85"
          >
            <path d="M860 575C880 580 920 580 940 570L930 565C910 570 880 570 860 565Z" />
            <path d="M900 568L902 530L898 530Z" />
            <path d="M900 535C915 545 930 560 935 565L895 565C895 550 898 540 900 535Z" />
          </g>
        </motion.g>

        <motion.g
          style={{ x: midWaveX, y: midWaveY }}
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: isLoaded ? 1 : 0, y: isLoaded ? 0 : 40 }}
          transition={{ duration: 2, delay: 1.2 }}
        >
          <path fill="url(#mh-waveMid)">
            <animate
              attributeName="d"
              dur="6s"
              repeatCount="indefinite"
              values="M-100 620C140 640 380 650 620 630C860 610 1100 590 1340 610C1460 620 1540 640 1600 650V900H-100Z;M-100 630C140 610 380 590 620 610C860 630 1100 650 1340 630C1460 620 1540 600 1600 590V900H-100Z;M-100 620C140 640 380 650 620 630C860 610 1100 590 1340 610C1460 620 1540 640 1600 650V900H-100Z"
            />
          </path>
        </motion.g>

        <motion.g
          style={{ x: frontWaveX, y: frontWaveY }}
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: isLoaded ? 1 : 0, y: isLoaded ? 0 : 50 }}
          transition={{ duration: 2, delay: 1.4 }}
        >
          <path fill="url(#mh-waveFront)">
            <animate
              attributeName="d"
              dur="5s"
              repeatCount="indefinite"
              values="M-100 670C140 650 380 640 620 660C860 680 1100 700 1340 680C1460 670 1540 650 1600 640V900H-100Z;M-100 660C140 680 380 700 620 680C860 660 1100 640 1340 660C1460 670 1540 690 1600 700V900H-100Z;M-100 670C140 650 380 640 620 660C860 680 1100 700 1340 680C1460 670 1540 650 1600 640V900H-100Z"
            />
          </path>
          <path
            fill="#FFFFFF"
            opacity="0.15"
            style={{ mixBlendMode: "overlay", animation: "mh-waterShimmer 4s ease-in-out infinite alternate" }}
          >
            <animate
              attributeName="d"
              dur="5s"
              repeatCount="indefinite"
              values="M-100 670C140 650 380 640 620 660C860 680 1100 700 1340 680C1460 670 1540 650 1600 640V680C1540 690 1460 710 1340 720C1100 740 860 720 620 700C380 680 140 690 -100 710Z;M-100 660C140 680 380 700 620 680C860 660 1100 640 1340 660C1460 670 1540 690 1600 700V740C1540 730 1460 710 1340 700C1100 680 860 700 620 720C380 740 140 720 -100 700Z;M-100 670C140 650 380 640 620 660C860 680 1100 700 1340 680C1460 670 1540 650 1600 640V680C1540 690 1460 710 1340 720C1100 740 860 720 620 700C380 680 140 690 -100 710Z"
            />
          </path>
          <path
            stroke="#FFFFFF"
            strokeWidth="4"
            strokeLinecap="round"
            fill="none"
            opacity="0.5"
            filter="url(#mh-glow)"
          >
            <animate
              attributeName="d"
              dur="4.5s"
              repeatCount="indefinite"
              values="M-50 690C150 675 350 670 550 685C750 700 950 715 1150 700C1300 690 1450 675 1550 670;M-50 680C150 695 350 710 550 695C750 680 950 665 1150 680C1300 690 1450 705 1550 710;M-50 690C150 675 350 670 550 685C750 700 950 715 1150 700C1300 690 1450 675 1550 670"
            />
          </path>
        </motion.g>

        <motion.g
          style={{ x: sandX, y: sandY }}
          initial={{ opacity: 0, y: 60 }}
          animate={{ opacity: isLoaded ? 1 : 0, y: isLoaded ? 0 : 60 }}
          transition={{ duration: 2, delay: 1.6 }}
        >
          <path
            d="M-100 710C140 690 380 680 620 700C860 720 1100 740 1340 720C1460 710 1540 690 1600 680V900H-100Z"
            fill="url(#mh-sandGrad)"
            filter="url(#mh-sandNoise)"
          />
          <path
            d="M-100 710C140 690 380 680 620 700C860 720 1100 740 1340 720C1460 710 1540 690 1600 680V710C1540 720 1460 740 1340 750C1100 770 860 750 620 730C380 710 140 720 -100 740Z"
            fill="#BCA27D"
            opacity="0.38"
          />
        </motion.g>

        <motion.g
          style={{ x: palmX, y: palmY }}
          initial={{ opacity: 0 }}
          animate={{ opacity: isLoaded ? 1 : 0 }}
          transition={{ duration: 2.5, delay: 1.8 }}
        >
          <g
            style={{
              transformOrigin: "100px 900px",
              animation: "mh-palmSwayL 8s ease-in-out infinite"
            }}
            fill="#081522"
            filter="url(#mh-dropShadow)"
          >
            <path d="M80 900C90 800 120 650 150 500C140 650 110 800 100 900Z" />
            <g transform="translate(150, 500)">
              <path d="M0 0C-30 -20 -80 -10 -120 20C-80 10 -40 10 0 0Z" />
              <path d="M0 0C-20 -40 -60 -50 -90 -30C-60 -30 -30 -20 0 0Z" />
              <path d="M0 0C10 -50 30 -80 60 -70C40 -50 20 -30 0 0Z" />
              <path d="M0 0C40 -30 90 -20 130 10C90 0 40 0 0 0Z" />
              <path d="M0 0C30 10 70 40 90 80C60 50 20 30 0 0Z" />
              <path d="M0 0C-20 20 -50 50 -60 90C-40 60 -10 30 0 0Z" />
              <circle cx="-10" cy="10" r="8" />
              <circle cx="10" cy="15" r="7" />
              <circle cx="0" cy="20" r="9" />
            </g>
          </g>
          <g
            style={{
              transformOrigin: "1350px 900px",
              animation: "mh-palmSwayR 9s ease-in-out infinite"
            }}
            fill="#081522"
            filter="url(#mh-dropShadow)"
          >
            <path d="M1360 900C1350 800 1320 600 1280 450C1330 600 1370 800 1380 900Z" />
            <g transform="translate(1280, 450) scale(1.2)">
              <path d="M0 0C-40 -10 -90 0 -130 30C-90 10 -40 10 0 0Z" />
              <path d="M0 0C-30 -40 -70 -60 -100 -40C-70 -30 -30 -20 0 0Z" />
              <path d="M0 0C0 -60 20 -90 50 -80C30 -50 10 -30 0 0Z" />
              <path d="M0 0C50 -20 100 -10 140 20C100 0 50 0 0 0Z" />
              <path d="M0 0C40 20 80 50 100 90C70 60 30 30 0 0Z" />
              <path d="M0 0C-10 30 -40 60 -50 100C-30 70 0 40 0 0Z" />
              <circle cx="-15" cy="15" r="10" />
              <circle cx="15" cy="20" r="9" />
            </g>
          </g>
        </motion.g>

        <motion.g
          style={{ x: sandX, y: sandY }}
          initial={{ opacity: 0 }}
          animate={{ opacity: isLoaded ? 1 : 0 }}
          transition={{ duration: 1, delay: 2 }}
        >
          <AnimatePresence mode="wait">
            {activeScene === 0 && (
              <motion.g
                key="scene-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1 }}
              >
                {(
                  [
                    [400, 680, "#DCC8A5"],
                    [450, 700, "#5FAEB6"],
                    [550, 690, "#FFFFFF"],
                    [800, 710, "#DCC8A5"],
                    [900, 685, "#5FAEB6"],
                    [1000, 705, "#FFFFFF"],
                    [350, 750, "#14324A"],
                    [600, 780, "#B89F7C"],
                    [850, 760, "#14324A"],
                    [1100, 790, "#B89F7C"]
                  ] as Array<[number, number, string]>
                ).map(([x, y, color], i) => (
                  <g
                    key={`${x}-${y}`}
                    style={{
                      animation:
                        y < 720
                          ? `mh-floatTrash ${3 + (i % 2)}s ease-in-out ${i * 0.5}s infinite`
                          : "none"
                    }}
                  >
                    <rect
                      x={x}
                      y={y}
                      width={12 + (i % 5)}
                      height={6 + (i % 3)}
                      rx="2"
                      fill={color}
                      opacity="0.78"
                      transform={`rotate(${i * 25} ${x} ${y})`}
                    />
                  </g>
                ))}
                <g
                  style={{ animation: "mh-walkSad 2s ease-in-out infinite" }}
                  fill="#081522"
                  filter="url(#mh-dropShadow)"
                >
                  <circle cx="650" cy="720" r="15" />
                  <path d="M645 740C640 760 645 790 650 810C655 790 660 760 655 740Z" />
                  <path d="M645 745C630 760 620 780 625 785C630 780 640 760 650 750Z" />
                  <path d="M655 745C670 760 680 780 675 785C670 780 660 760 650 750Z" />
                  <path d="M635 760L610 810" stroke="#081522" strokeWidth="4" strokeLinecap="round" />
                </g>
              </motion.g>
            )}

            {activeScene === 1 && (
              <motion.g
                key="scene-1"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1 }}
              >
                <g
                  style={{ animation: "mh-bendPick 4s ease-in-out infinite" }}
                  fill="#081522"
                  filter="url(#mh-dropShadow)"
                >
                  <circle cx="500" cy="730" r="14" />
                  <path d="M495 750C490 770 495 800 500 820C505 800 510 770 505 750Z" />
                  <path d="M495 755C470 770 460 790 465 795C470 790 480 770 500 760Z" />
                  <path d="M460 790C450 810 470 820 480 800Z" fill="#D8C4A2" opacity="0.95" />
                </g>
                <g
                  style={{ animation: "mh-bendPick 4s ease-in-out 2s infinite" }}
                  fill="#081522"
                  filter="url(#mh-dropShadow)"
                >
                  <circle cx="850" cy="740" r="16" />
                  <path d="M845 760C840 780 845 810 850 830C855 810 860 780 855 760Z" />
                  <path d="M845 765C820 780 810 800 815 805C820 800 830 780 850 770Z" />
                  <path d="M810 800C800 820 820 830 830 810Z" fill="#67B4B8" opacity="0.95" />
                </g>
                {[480, 520, 830, 870].map((x, i) => (
                  <circle
                    key={x}
                    cx={x}
                    cy={780 - i * 10}
                    r="4"
                    fill="#F5E8D3"
                    filter="url(#mh-glow)"
                    style={{ animation: `mh-sparkleUp 2s ease-out ${i * 0.5}s infinite` }}
                  />
                ))}
              </motion.g>
            )}

            {activeScene === 2 && (
              <motion.g
                key="scene-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1 }}
              >
                <path
                  d="M200 850C350 780 500 750 650 780C800 810 950 850 1100 820"
                  stroke="#E7D8C0"
                  strokeWidth="20"
                  strokeLinecap="round"
                  fill="none"
                  opacity="0.65"
                />
                <path
                  d="M200 850C350 780 500 750 650 780C800 810 950 850 1100 820"
                  stroke="#081522"
                  strokeWidth="4"
                  strokeDasharray="10 10"
                  strokeLinecap="round"
                  fill="none"
                  opacity="0.4"
                />
                <g transform="translate(200, 850)" filter="url(#mh-dropShadow)">
                  <path d="M0 0L0 -40" stroke="#081522" strokeWidth="4" strokeLinecap="round" />
                  <path
                    d="M0 -40L20 -30L0 -20"
                    fill="#67B4B8"
                    style={{ animation: "mh-flagWave 2s ease-in-out infinite" }}
                  />
                </g>
                <g transform="translate(1100, 820)" filter="url(#mh-dropShadow)">
                  <path d="M0 0L0 -40" stroke="#081522" strokeWidth="4" strokeLinecap="round" />
                  <path
                    d="M0 -40L20 -30L0 -20"
                    fill="#D8C4A2"
                    style={{ animation: "mh-flagWave 2s ease-in-out infinite 0.5s" }}
                  />
                </g>
                <g
                  transform="translate(650, 780)"
                  style={{ animation: "mh-runMotion 0.8s ease-in-out infinite" }}
                >
                  <circle cx="0" cy="-20" r="6" fill="#081522" />
                  <path d="M0 -14L0 0" stroke="#081522" strokeWidth="4" strokeLinecap="round" />
                  <path d="M0 -10L-8 -5" stroke="#081522" strokeWidth="3" strokeLinecap="round" />
                  <path d="M0 -10L8 -15" stroke="#081522" strokeWidth="3" strokeLinecap="round" />
                  <path d="M0 0L-5 10" stroke="#081522" strokeWidth="4" strokeLinecap="round" />
                  <path d="M0 0L8 8" stroke="#081522" strokeWidth="4" strokeLinecap="round" />
                </g>
              </motion.g>
            )}

            {activeScene === 3 && (
              <motion.g
                key="scene-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 1 }}
              >
                <g transform="translate(900, 750)" filter="url(#mh-dropShadow)">
                  <path d="M0 0L0 80" stroke="#081522" strokeWidth="6" strokeLinecap="round" />
                  <path d="M100 0L100 80" stroke="#081522" strokeWidth="6" strokeLinecap="round" />
                  <rect x="0" y="10" width="100" height="20" fill="#E7D8C0" />
                  <text
                    x="50"
                    y="24"
                    fontSize="10"
                    fontWeight="bold"
                    fill="#081522"
                    textAnchor="middle"
                    fontFamily="system-ui"
                  >
                    FINISH
                  </text>
                </g>

                {[
                  { x: 400, y: 800, scale: 1.2, delay: 0 },
                  { x: 550, y: 780, scale: 1, delay: 0.2 },
                  { x: 700, y: 820, scale: 1.4, delay: 0.4 }
                ].map((runner, i) => (
                  <g
                    key={`${runner.x}-${runner.y}`}
                    transform={`translate(${runner.x}, ${runner.y}) scale(${runner.scale})`}
                  >
                    <path
                      d="M-10 -10L-30 -10"
                      stroke="#081522"
                      strokeWidth="2"
                      strokeLinecap="round"
                      style={{ animation: `mh-runTrail 0.5s linear ${runner.delay}s infinite` }}
                    />
                    <path
                      d="M-5 5L-25 5"
                      stroke="#081522"
                      strokeWidth="2"
                      strokeLinecap="round"
                      style={{ animation: `mh-runTrail 0.5s linear ${runner.delay + 0.2}s infinite` }}
                    />
                    <g style={{ animation: `mh-runMotion 0.6s ease-in-out ${runner.delay}s infinite` }}>
                      <circle cx="0" cy="-25" r="8" fill="#081522" />
                      <path d="M0 -17L5 5" stroke="#081522" strokeWidth="6" strokeLinecap="round" />
                      <path d="M2 -10L-10 -5" stroke="#081522" strokeWidth="5" strokeLinecap="round" />
                      <path d="M2 -10L12 -15" stroke="#081522" strokeWidth="5" strokeLinecap="round" />
                      <path d="M5 5L-5 20" stroke="#081522" strokeWidth="6" strokeLinecap="round" />
                      <path d="M5 5L15 15" stroke="#081522" strokeWidth="6" strokeLinecap="round" />
                    </g>
                  </g>
                ))}
              </motion.g>
            )}
          </AnimatePresence>
        </motion.g>

        <rect width="100%" height="100%" fill="url(#mh-vignette)" pointerEvents="none" />
      </svg>

      <div className="absolute inset-0 z-10 flex flex-col justify-between p-8 pointer-events-none md:p-16">
        <div />

        <div className="mt-[-8vh] flex max-w-4xl flex-1 flex-col items-center justify-center text-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeScene}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="flex flex-col items-center"
            >
              <div className="mb-4 font-body text-sm font-bold uppercase tracking-[0.4em] text-[#E9DBC1] drop-shadow-md md:text-base">
                {SCENES[activeScene].label}
              </div>
              <h2 className="flex flex-wrap justify-center gap-x-4 font-display text-5xl font-bold leading-tight text-[#F5EBDD] drop-shadow-[0_4px_20px_rgba(8,21,34,0.82)] md:text-7xl lg:text-8xl">
                {headlineWords.map((word, i) => (
                  <motion.span
                    key={`${word}-${i}`}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: i * 0.15 }}
                  >
                    {word}
                  </motion.span>
                ))}
              </h2>
              <p className="mt-6 max-w-2xl font-body text-lg font-medium text-[#E7D8C0] drop-shadow-md md:text-2xl">
                {SCENES[activeScene].tagline}
              </p>
            </motion.div>
          </AnimatePresence>

          <motion.button
            type="button"
            onClick={() => {
              window.scrollTo({ top: window.innerHeight, behavior: "smooth" })
            }}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: isLoaded ? 1 : 0, scale: isLoaded ? 1 : 0.9 }}
            transition={{ duration: 1, delay: 3 }}
            className="mt-12 inline-flex rounded-full border border-[#E7D8C0]/35 bg-[#E1D0B2] px-10 py-4 font-body text-sm font-bold uppercase tracking-[0.2em] text-[#081522] transition-colors hover:bg-[#F1E4CF] pointer-events-auto"
            style={{ animation: "mh-pulseGlow 3s infinite alternate" }}
          >
            {primaryLabel}
          </motion.button>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: isLoaded ? 1 : 0, y: isLoaded ? 0 : 30 }}
          transition={{ duration: 1, delay: 2.8 }}
          className="flex w-full justify-end"
        >
          <div className="hidden flex-col items-center gap-2 opacity-60 md:flex">
            <span className="font-body text-[10px] uppercase tracking-[0.3em] text-[#F5EBDD]">
              Discover
            </span>
            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              className="h-12 w-[1px] bg-gradient-to-b from-[#F5EBDD] to-transparent"
            />
          </div>
        </motion.div>
      </div>
    </div>
  )
}
