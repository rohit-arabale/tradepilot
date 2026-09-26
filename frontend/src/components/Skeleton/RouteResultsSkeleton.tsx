import React from "react";

const RouteResultsSkeleton = () => {
  return (
    <div className="w-full max-w-4xl mx-auto p-4">
      {/* Filter Buttons Skeleton */}
      <div className="flex flex-wrap gap-3 sm:gap-4 mb-4 sm:mb-6 justify-center max-w-3xl w-full">
        {[1, 2, 3, 4].map((_, index) => (
          <div
            key={index}
            className="h-10 w-28 sm:w-32 bg-gray-200 rounded-lg animate-pulse"
          />
        ))}
      </div>

      {/* Routes List Skeleton */}
      <div className="space-y-4">
        {[1, 2, 3].map((_, index) => (
          <div
            key={index}
            className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col sm:flex-row items-start justify-between gap-4"
          >
            {/* Route Info Skeleton */}
            <div className="flex-1 space-y-2">
              <div className="h-6 w-24 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-2/3 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-1/2 bg-gray-200 rounded animate-pulse" />
              <div className="h-4 w-3/5 bg-gray-200 rounded animate-pulse" />
            </div>

            {/* Route Metrics and Buttons Skeleton */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 w-full sm:w-auto">
              <div className="flex flex-wrap gap-2 sm:gap-4">
                {[1, 2, 3, 4].map((_, i) => (
                  <div
                    key={i}
                    className="h-4 w-16 bg-gray-200 rounded animate-pulse"
                  />
                ))}
              </div>
              <div className="flex gap-4 p-2 w-full sm:w-auto justify-start sm:justify-end">
                {[1, 2, 3].map((_, i) => (
                  <div
                    key={i}
                    className="h-10 w-10 bg-gray-200 rounded-full animate-pulse"
                  />
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RouteResultsSkeleton;
