import HeroSection from '../components/home/HeroSection';
import StatsSection from '../components/home/StatsSection';
import CategoryShowcaseSection from '../components/home/CategoryShowcaseSection';
import InfiniteCategoriesMarquee from '../components/home/InfiniteCategoriesMarquee';
import ProcessSection from '../components/home/ProcessSection';
import SwapperOfTheWeek from '../components/home/SwapperOfTheWeek';
import TestimonialsSection from '../components/home/TestimonialsSection';
import CTASection from '../components/home/CTASection';

export default function Home() {
  return (
    <div className="flex flex-col w-full bg-[#FBF9F4]">
      <HeroSection />
      <StatsSection />
      <CategoryShowcaseSection />
      <ProcessSection />
      <InfiniteCategoriesMarquee />
      <SwapperOfTheWeek />
      <TestimonialsSection />
      <CTASection />
    </div>
  );
}
