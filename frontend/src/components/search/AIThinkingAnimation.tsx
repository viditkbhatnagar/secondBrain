import React from 'react';
import { motion } from 'framer-motion';
import { Brain, Sparkles } from 'lucide-react';

export const AIThinkingAnimation: React.FC = () => {
  return (
    <div className="relative w-32 h-32 mx-auto">
      {/* Outer glow ring */}
      <motion.div
        className="absolute inset-0 rounded-full bg-gradient-to-r from-primary-500 to-accent-500 opacity-20"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.2, 0.3, 0.2],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Middle ring */}
      <motion.div
        className="absolute inset-4 rounded-full bg-gradient-to-r from-primary-400 to-accent-400 opacity-30"
        animate={{
          scale: [1, 1.15, 1],
          opacity: [0.3, 0.4, 0.3],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.2,
        }}
      />

      {/* Inner circle with brain */}
      <motion.div
        className="absolute inset-8 rounded-full bg-gradient-to-br from-primary-500 to-accent-600 flex items-center justify-center shadow-lg"
        animate={{
          scale: [1, 1.05, 1],
        }}
        transition={{
          duration: 2,
          repeat: Infinity,
          ease: "easeInOut",
          delay: 0.4,
        }}
      >
        <Brain className="w-12 h-12 text-white" />
      </motion.div>

      {/* Orbiting sparkles */}
      {[0, 120, 240].map((angle, i) => (
        <motion.div
          key={i}
          className="absolute top-1/2 left-1/2"
          style={{
            marginLeft: '-4px',
            marginTop: '-4px',
          }}
          animate={{
            rotate: [angle, angle + 360],
          }}
          transition={{
            duration: 3,
            repeat: Infinity,
            ease: "linear",
          }}
        >
          <motion.div
            style={{
              transform: `translateX(60px)`,
            }}
            animate={{
              scale: [1, 1.3, 1],
              opacity: [0.6, 1, 0.6],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: i * 0.2,
            }}
          >
            <Sparkles className="w-4 h-4 text-accent-400" />
          </motion.div>
        </motion.div>
      ))}
    </div>
  );
};
