import { SkeletonTable } from "@/components/loaders";

export default function PortalLoading() {
  return (
    <div className="space-y-4" role="status" aria-label="Loading the page">
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="bg-white px-4 py-4">
            <span className={`skeleton skeleton-row-${index + 1} block h-3 w-20`} />
            <span className={`skeleton skeleton-row-${index + 1} mt-3 block h-7 w-16`} />
          </div>
        ))}
      </div>
      <div className="rounded-card border border-line bg-white">
        <SkeletonTable rows={7} columns={5} />
      </div>
    </div>
  );
}
