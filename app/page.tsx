'use client';

import { useStockStore } from '@/lib/store';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Package, TrendingUp, TrendingDown, AlertCircle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

export default function Home() {
  const items = useStockStore((state) => state.items);
  console.log('DEBUG: Home Render. items:', items ? items.length : 'undefined');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    console.log('DEBUG: Home useEffect mounted');
    setMounted(true);
  }, []);

  // if (!mounted) {
  //   console.log('DEBUG: Home returning null because not mounted');
  //   return null;
  // }

  console.log('DEBUG: Home rendering content div');
  return (
    <div className="p-10 text-white text-4xl font-bold">
      DEBUG MODE: STATIC CONTENT.
      <br />
      NO STORE DEPENDENCY.
    </div>
  );
}
