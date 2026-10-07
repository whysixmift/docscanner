'use client';

import React from 'react';
import Image from 'next/image';
import { ScannedPage } from '@/lib/opencv/types';
import { Trash2, Plus, FileText } from 'lucide-react';

interface MultiPageTrayProps {
  pages: ScannedPage[];
  activePageId: string | null;
  onSelectPage: (id: string) => void;
  onDeletePage: (id: string) => void;
  onAddNewPage: () => void;
}

export const MultiPageTray: React.FC<MultiPageTrayProps> = ({
  pages,
  activePageId,
  onSelectPage,
  onDeletePage,
  onAddNewPage,
}) => {
  if (pages.length === 0) return null;

  return (
    <div className="border-b border-neutral-800 bg-neutral-900/90 px-4 py-2">
      <div className="flex items-center space-x-3 overflow-x-auto pb-1">
        <span className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wider text-neutral-400">
          <FileText className="h-3 w-3" />
          <span>Pages ({pages.length})</span>
        </span>

        {pages.map((page, index) => {
          const isActive = page.id === activePageId;
          return (
            <div
              key={page.id}
              onClick={() => onSelectPage(page.id)}
              className={`group relative flex cursor-pointer items-center space-x-1.5 rounded border p-1 text-xs transition-colors ${
                isActive
                  ? 'border-blue-500 bg-blue-950/40 text-blue-300'
                  : 'border-neutral-700 bg-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200'
              }`}
            >
              {/* Mini thumbnail */}
              {page.processedDataUrl && (
                <Image
                  src={page.processedDataUrl}
                  alt={`Page ${index + 1}`}
                  width={20}
                  height={28}
                  unoptimized
                  className="h-7 w-5 rounded-xs object-cover"
                />
              )}
              <span className="font-mono text-[11px]">#{index + 1}</span>

              {/* Delete button */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeletePage(page.id);
                }}
                title="Delete this page"
                className="opacity-60 transition-opacity hover:text-red-400 hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}

        <button
          onClick={onAddNewPage}
          className="flex items-center gap-1 rounded border border-dashed border-neutral-700 px-2.5 py-1 text-xs text-neutral-400 transition-colors hover:border-neutral-500 hover:text-neutral-200"
        >
          <Plus className="h-3 w-3" />
          <span>Scan Next</span>
        </button>
      </div>
    </div>
  );
};
