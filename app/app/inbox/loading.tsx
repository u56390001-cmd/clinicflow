import { Skeleton } from "@/components/ui/skeleton";

/**
 * Two-pane inbox placeholder. Carries `data-app-wide` itself because the inbox
 * page opts out of the shell's width cap on its own root (there is no separate
 * layout doing it), so the skeleton has to match to avoid a width jump.
 */
export default function InboxLoading() {
  return (
    <div data-app-wide className="min-w-0">
      <div
        className="flex flex-col overflow-hidden bg-gradient-to-br from-gray-50 to-gray-100"
        style={{
          height: "calc(100svh - 10.5rem)",
          maxHeight: "calc(100svh - 10.5rem)",
        }}
      >
        <div className="hidden flex-shrink-0 items-stretch md:flex">
          <div className="flex w-80 flex-shrink-0 flex-col justify-center border-b border-r border-gray-200 bg-white px-4 py-4">
            <p className="text-xl font-bold text-gray-900">Messages</p>
            <p className="mt-0.5 text-xs text-gray-500">WhatsApp conversations</p>
          </div>
          <div className="min-w-0 flex-1 border-b border-gray-200 bg-white" />
        </div>

        <div className="flex min-h-0 flex-1 flex-row">
          <div className="flex w-80 flex-shrink-0 flex-col overflow-hidden border-r border-gray-200 bg-white">
            <div className="divide-y divide-gray-100">
              {Array.from({ length: 7 }).map((_, index) => (
                <div key={index} className="flex items-center gap-3 px-4 py-[10px]">
                  <Skeleton className="h-[46px] w-[46px] shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1 space-y-2">
                    <Skeleton className="h-3.5 w-2/3" />
                    <Skeleton className="h-3 w-5/6" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0 flex-1 bg-[#EFEAE2]" />
        </div>
      </div>
    </div>
  );
}