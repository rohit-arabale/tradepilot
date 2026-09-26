import React from "react";
import { motion } from "framer-motion";

const ComplianceResponseSkeleton = () => {
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
        delayChildren: 0.05,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 10, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: { duration: 0.15, ease: "easeOut" },
    },
  };

  return (
    <div className="max-w-7xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15, ease: "easeOut" }}
        className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-8"
      >
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          {/* Header */}
          <motion.div
            variants={itemVariants}
            className="mb-6 flex items-center"
          >
            <div className="w-10 h-10 bg-gray-300 rounded-full animate-pulse mr-2" />
            <div className="h-8 w-64 bg-gray-300 rounded animate-pulse" />
          </motion.div>

          {/* Compliance Status */}
          <motion.div variants={itemVariants} className="mb-6">
            <div className="h-6 w-24 bg-gray-300 rounded animate-pulse mb-2" />
            <div className="h-8 w-40 bg-gray-300 rounded-full animate-pulse" />
          </motion.div>

          {/* Summary */}
          <motion.div variants={itemVariants} className="mb-6">
            <div className="h-6 w-28 bg-gray-300 rounded animate-pulse mb-2" />
            <div className="h-4 w-full bg-gray-300 rounded animate-pulse mb-1" />
            <div className="h-4 w-3/4 bg-gray-300 rounded animate-pulse" />
          </motion.div>

          {/* Risk Level */}
          <motion.div variants={itemVariants} className="mb-6">
            <div className="h-6 w-32 bg-gray-300 rounded animate-pulse mb-2" />
            <div className="h-4 w-24 bg-gray-300 rounded animate-pulse mb-2" />
            <div className="w-full bg-gray-200 rounded-full h-4 mt-2 overflow-hidden">
              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 0.5 }}
                style={{ originX: 0 }}
                transition={{ duration: 0.3, ease: "easeOut" }}
                className="h-4 w-full bg-gray-300 rounded-full animate-pulse"
              />
            </div>
            <div className="h-4 w-5/6 bg-gray-300 rounded animate-pulse mt-2" />
          </motion.div>

          {/* Violations and Recommendations */}
          <motion.div variants={itemVariants} className="mb-6">
            <div className="h-6 w-48 bg-gray-300 rounded animate-pulse mb-2" />
            <div className="overflow-x-auto mt-2">
              <div className="min-w-full bg-white rounded-lg shadow-sm">
                <div className="bg-gray-200 h-10 w-full animate-pulse" />
                <div className="space-y-2 p-2">
                  {[1, 2, 3, 4].map((_, index) => (
                    <motion.div
                      key={index}
                      variants={itemVariants}
                      className="flex border-b py-2"
                    >
                      <div className="h-4 w-1/4 bg-gray-300 rounded animate-pulse mx-2" />
                      <div className="h-4 w-1/3 bg-gray-300 rounded animate-pulse mx-2" />
                      <div className="h-4 w-1/3 bg-gray-300 rounded animate-pulse mx-2" />
                    </motion.div>
                  ))}
                </div>
              </div>
            </div>
          </motion.div>

          {/* Scores */}
          <motion.div variants={itemVariants} className="mb-6">
            <div className="h-6 w-40 bg-gray-300 rounded animate-pulse mb-4" />
            <div className="h-64 w-full bg-gray-300 rounded animate-pulse" />
          </motion.div>

          {/* Additional Tips */}
          <motion.div variants={itemVariants}>
            <div className="h-6 w-36 bg-gray-300 rounded animate-pulse mb-2" />
            <div className="space-y-2">
              {[1, 2, 3, 4].map((_, index) => (
                <motion.div
                  key={index}
                  variants={itemVariants}
                  className="flex items-start"
                >
                  <div className="h-4 w-2 bg-gray-300 rounded animate-pulse mr-2" />
                  <div className="h-4 w-5/6 bg-gray-300 rounded animate-pulse" />
                </motion.div>
              ))}
            </div>
          </motion.div>
        </motion.div>
      </motion.div>
    </div>
  );
};

export default ComplianceResponseSkeleton;
