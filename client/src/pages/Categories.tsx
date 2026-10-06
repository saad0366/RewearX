import { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { Tag, ArrowRight, Loader2 } from 'lucide-react';

interface Category {
  id: number;
  name: string;
  description: string | null;
  iconUrl: string | null;
  itemCount?: number;
}

import { http } from '../lib/api/client';

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    try {
      const data = await http.get<Category[]>('/categories');
      if (data) {
        setCategories(data);
      }
    } catch (error) {
      console.error('Failed to fetch categories:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 lg:px-12 pt-10 sm:pt-12 pb-12 font-body">
        <div className="flex flex-col items-center justify-center py-20">
          <Loader2 size={40} className="animate-spin text-primary/40 mb-4" />
          <p className="text-muted-foreground">Loading categories...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto w-full px-4 sm:px-8 lg:px-12 pt-8 sm:pt-10 md:pt-12 pb-12 sm:pb-16 md:pb-20 font-body">
      {/* Header */}
      <div className="text-center mb-12">
        <h1 className="font-headings text-3xl sm:text-4xl md:text-5xl font-bold text-primary mb-4 leading-tight">
          Browse Categories
        </h1>
        <p className="text-muted-foreground text-sm sm:text-base leading-relaxed max-w-2xl mx-auto">
          Explore a variety of clothing categories. Find exactly what you're looking for.
        </p>
      </div>

      {/* Categories Grid */}
      {categories.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
          {categories.map((category) => (
            <Link key={category.id} href={`/browse?category=${category.id}`}>
              <div className="group bg-white rounded-xl border-2 border-gray-200 hover:border-primary transition-all overflow-hidden cursor-pointer hover:shadow-lg">
                {/* Icon/Image */}
                <div className="aspect-square bg-gradient-to-br from-primary/5 to-primary/10 flex items-center justify-center p-6 group-hover:from-primary/10 group-hover:to-primary/20 transition-colors">
                  {category.iconUrl ? (
                    <img 
                      src={category.iconUrl} 
                      alt={category.name}
                      className="w-full h-full object-contain"
                    />
                  ) : (
                    <Tag size={48} className="text-primary/60 group-hover:text-primary transition-colors" />
                  )}
                </div>

                {/* Content */}
                <div className="p-4">
                  <h3 className="font-semibold text-primary mb-1 group-hover:text-primary/80 transition-colors text-center">
                    {category.name}
                  </h3>
                  {category.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 text-center mb-2">
                      {category.description}
                    </p>
                  )}
                  {category.itemCount !== undefined && (
                    <p className="text-xs text-center text-gray-500 font-medium">
                      {category.itemCount} {category.itemCount === 1 ? 'item' : 'items'}
                    </p>
                  )}
                </div>

                {/* Hover Arrow */}
                <div className="px-4 pb-4 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="flex items-center justify-center gap-2 text-sm text-primary font-semibold">
                    Browse <ArrowRight size={14} />
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="text-center py-20 bg-white rounded-xl border-2 border-dashed">
          <Tag size={48} className="text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-600 mb-2">No Categories Available</h3>
          <p className="text-muted-foreground">Categories will appear here once added by administrators.</p>
        </div>
      )}
    </div>
  );
}

