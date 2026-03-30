'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';
import { Pagination } from '../_components/Pagination';

type PaginationContainerProps = {
  currentPage: number;
  pageSize: number;
  totalRows: number;
};

export function PaginationContainer({
  currentPage,
  pageSize,
  totalRows,
}: PaginationContainerProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const goToPage = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (page === 1) {
        params.delete('page');
      } else {
        params.set('page', String(page));
      }
      router.push(`?${params.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  return (
    <Pagination
      currentPage={currentPage}
      pageSize={pageSize}
      totalRows={totalRows}
      onGoToPage={goToPage}
    />
  );
}
