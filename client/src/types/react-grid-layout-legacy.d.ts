declare module 'react-grid-layout/legacy' {
  import type { ComponentType } from 'react';

  export const Responsive: ComponentType<any>;

  export function WidthProvider<P extends { width?: number }>(
    component: ComponentType<P>
  ): ComponentType<Omit<P, 'width'>>;
}
