/**
 * Shared page-level loading spinner component.
 *
 * Every protected page had an identical loading state JSX block:
 *   <div className="min-h-screen flex items-center justify-center">
 *     <Loader2 className="h-8 w-8 animate-spin text-accent" />
 *   </div>
 *
 * Using this component removes that repeated markup from six+ files.
 */

import { Loader2 } from 'lucide-react';

export function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-accent" />
    </div>
  );
}
