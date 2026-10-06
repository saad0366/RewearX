import React from 'react';
import { motion, useScroll, AnimatePresence } from 'motion/react';
import { useLocation } from 'wouter';
import Navbar from '../components/layout/Navbar';
import Footer from '../components/layout/Footer';
import ScrollToTopButton from '../components/layout/ScrollToTopButton';
import AISearchWidget from '../components/layout/AISearchWidget';

interface MainLayoutProps {
  children: React.ReactNode;
}

export default function MainLayout({ children }: MainLayoutProps) {
  const { scrollYProgress } = useScroll();
  const [location] = useLocation();
  const isImmersive = location.startsWith('/chat');

  return (
    <div className="bg-background text-primary min-h-screen flex flex-col font-body relative overflow-x-hidden">
        {/* Scroll Progress Bar */}
        <motion.div 
          className="fixed top-0 left-0 right-0 h-1 bg-accent z-[100] origin-left shadow-sm"
          style={{ scaleX: scrollYProgress }}
        />
        
        {/* Background decorative element — desktop only */}
        <div className="hidden md:block absolute top-0 right-0 w-[300px] lg:w-[500px] h-[300px] lg:h-[500px] opacity-20 pointer-events-none mix-blend-multiply">
          <div
            className="bg-no-repeat aspect-[4/3] w-full h-full"
            style={{
              backgroundImage: 'url("https://firebasestorage.googleapis.com/v0/b/banani-prod.appspot.com/o/reference-images%2Fe990e254-554b-48ad-bb2d-626d12a0ed9d?alt=media&token=c1c20cfa-7e92-4db2-bbc9-10de0b3f81b6")',
              backgroundPosition: '90% 10%',
              backgroundSize: '320% 380%',
            }}
          ></div>
        </div>
        
        <Navbar />
        
        <AnimatePresence mode="wait">
          <motion.main 
            key={location}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="flex-grow w-full flex flex-col"
          >
              {children}
          </motion.main>
        </AnimatePresence>
        
        {!isImmersive && <Footer />}
        {!isImmersive && <ScrollToTopButton />}
        {!isImmersive && <AISearchWidget />}
    </div>
  );
}
