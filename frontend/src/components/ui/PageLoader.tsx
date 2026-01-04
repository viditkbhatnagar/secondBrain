import React from 'react';
import { motion } from 'framer-motion';
import { Brain } from 'lucide-react';

interface PageLoaderProps {
  message?: string;
}

const PageLoader: React.FC<PageLoaderProps> = ({ message = 'Loading...' }) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] py-12">
      <motion.div
        animate={{
          scale: [1, 1.1, 1],
          opacity: [0.7, 1, 0.7],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="relative"
      >
        <div className="absolute inset-0 bg-primary-500/20 blur-xl rounded-full" />
        <Brain className="relative h-12 w-12 text-primary-600 dark:text-primary-400" />
      </motion.div>
      <motion.p
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="mt-4 text-secondary-500 dark:text-secondary-400 text-sm"
      >
        {message}
      </motion.p>
    </div>
  );
};

export default PageLoader;
