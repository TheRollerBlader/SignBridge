import { useRef, useState, useEffect, useCallback } from 'react';
import {
  motion,
  useInView,
  AnimatePresence,
  useScroll,
  useTransform,
} from 'framer-motion';

interface TimedOverlay {
  time: number;
  label: string;
}

interface SlideData {
  videoUrl: string;
  headline: string;
  subtext: string;
  dark?: boolean;
  timedOverlays?: TimedOverlay[];
}

const slides: SlideData[] = [
  {
    videoUrl:
      'https://res.cloudinary.com/dfw9z5ajv/video/upload/v1774416288/First_Video_b6vdlu.mp4',
    headline: 'Precision in Every Letter.',
    subtext:
      'Our foundational model delivers highly accurate, production-ready fingerspelling translation. It is the reliable baseline of Project Signbridge.',
    timedOverlays: [{ time: 6, label: 'K' }],
  },
  {
    videoUrl:
      'https://res.cloudinary.com/dfw9z5ajv/video/upload/v1774416374/Second_Video_fuuuuy.mp4',
    headline: "But conversation isn't spelled.",
    subtext:
      'Letter-by-letter translation is a great tool, but it is not a bridge. True, natural communication happens fluidly, at the speed of thought.',
  },
  {
    videoUrl:
      'https://res.cloudinary.com/dfw9z5ajv/video/upload/v1774416479/third_video_wg0ipn.mp4',
    headline: 'Pioneering the Next Step.',
    subtext:
      'We are pushing the boundaries with an experimental, spatiotemporal model trained on 2,000 common ASL words. It is early-stage, it is raw, but it is the future of fluid translation.',
    dark: true,
    timedOverlays: [
      { time: 10, label: 'HELLO' },
      { time: 22, label: "WHAT'S UP" },
    ],
  },
  {
    videoUrl:
      'https://res.cloudinary.com/dfw9z5ajv/video/upload/v1774416726/fourth_video_wfbb22.mp4',
    headline: 'Vision is Our Bridge.',
    subtext:
      'Rock-solid spelling for accuracy today. Experimental word-level tracking for the conversations of tomorrow. We are building the bridge between the two.',
  },
];

function RecognitionBadge({
  label,
  dark,
}: {
  label: string;
  dark?: boolean;
}) {
  return (
    <motion.div
      className={`recognition-badge ${dark ? 'recognition-badge--dark' : ''}`}
      initial={{ opacity: 0, scale: 0.65, filter: 'blur(6px)' }}
      animate={{
        opacity: 1,
        scale: 1,
        filter: 'blur(0px)',
        transition: { type: 'spring', stiffness: 300, damping: 20 },
      }}
      exit={{ opacity: 0, scale: 0.85, filter: 'blur(6px)', transition: { duration: 0.25 } }}
    >
      <span className="recognition-badge__dot" />
      {label}
    </motion.div>
  );
}

function ScrollSlide({ slide, index }: { slide: SlideData; index: number }) {
  const sectionRef = useRef<HTMLElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isInView = useInView(sectionRef, { amount: 0.15 });
  const [activeOverlays, setActiveOverlays] = useState<string[]>([]);
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ['start end', 'end start'],
  });
  const videoScale = useTransform(scrollYProgress, [0, 0.5, 1], [1.14, 1, 1.08]);
  const videoY = useTransform(scrollYProgress, [0, 1], [80, -80]);
  const videoRotate = useTransform(scrollYProgress, [0, 0.5, 1], [-1.5, 0, 1.5]);
  const textOpacity = useTransform(
    scrollYProgress,
    [0, 0.38, 0.52, 0.88, 1],
    [0, 0, 1, 1, 0]
  );
  const textY = useTransform(scrollYProgress, [0.42, 0.58], [40, 0]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isInView) {
      video.play().catch(() => {});
    } else {
      video.pause();
    }
  }, [isInView]);

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video || !slide.timedOverlays) return;

    const current = video.currentTime;
    const visible = slide.timedOverlays
      .filter((o) => current >= o.time && current < o.time + 4)
      .map((o) => o.label);
    setActiveOverlays(visible);
  }, [slide.timedOverlays]);

  return (
    <section
      ref={sectionRef}
      className={`scrolly-slide ${slide.dark ? 'scrolly-slide--dark' : ''}`}
    >
      <div className="scrolly-slide__sticky">
        <motion.div
          className="video-mask-container"
          style={{ scale: videoScale, y: videoY, rotate: videoRotate }}
        >
          <video
            ref={videoRef}
            src={slide.videoUrl}
            muted
            autoPlay
            playsInline
            loop
            preload="auto"
            onTimeUpdate={handleTimeUpdate}
            className="video-mask-container__video"
          />
          <div className="video-edge-fade video-edge-fade--top" />
          <div className="video-edge-fade video-edge-fade--bottom" />
          <div className="video-vignette" />
          <AnimatePresence>
            {activeOverlays.map((label) => (
              <RecognitionBadge key={label} label={label} dark={slide.dark} />
            ))}
          </AnimatePresence>
        </motion.div>

        <motion.div className="scrolly-slide__text" style={{ opacity: textOpacity, y: textY }}>
          <motion.h2
            className={`slide-headline ${slide.dark ? 'slide-headline--dark' : ''}`}
            initial={{ opacity: 0, y: 48, filter: 'blur(8px)' }}
            animate={
              isInView
                ? { opacity: 1, y: 0, filter: 'blur(0px)' }
                : { opacity: 0, y: 20, filter: 'blur(8px)' }
            }
            transition={{ duration: 0.8, ease: 'easeOut' }}
          >
            {slide.headline}
          </motion.h2>
          <motion.p
            className={`slide-subtext ${slide.dark ? 'slide-subtext--dark' : ''}`}
            initial={{ opacity: 0, y: 28 }}
            animate={isInView ? { opacity: 1, y: 0 } : { opacity: 0, y: 20 }}
            transition={{ duration: 0.75, delay: 0.18, ease: 'easeOut' }}
          >
            {slide.subtext}
          </motion.p>
          <motion.div className="slide-index" animate={isInView ? { opacity: 0.16 } : { opacity: 0 }}>
            {String(index + 1).padStart(2, '0')}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

export default function ScrollyTelling() {
  return (
    <div className="scrollytelling-root">
      <div className="scrolly-transition-bridge" />
      {slides.map((slide, i) => (
        <ScrollSlide key={i} slide={slide} index={i} />
      ))}
    </div>
  );
}
