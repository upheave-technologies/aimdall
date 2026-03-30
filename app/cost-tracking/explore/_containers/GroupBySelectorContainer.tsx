'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { GroupBySelector } from '../_components/GroupBySelector';

type GroupBySelectorContainerProps = {
  current?: string;
};

export function GroupBySelectorContainer({ current }: GroupBySelectorContainerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleSelect = useCallback(
    (dimension: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.delete('page');

      if (current === dimension) {
        params.delete('groupBy');
      } else {
        params.set('groupBy', dimension);
      }

      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams, current],
  );

  const handleNone = useCallback(() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete('groupBy');
    params.delete('page');
    router.push(`?${params.toString()}`, { scroll: false });
  }, [router, searchParams]);

  return (
    <GroupBySelector
      current={current}
      onSelect={handleSelect}
      onNone={handleNone}
    />
  );
}
