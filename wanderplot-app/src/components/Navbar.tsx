'use client';
import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { MapPin, Menu, X, User, LogOut, Heart, LayoutDashboard, ArrowRight } from 'lucide-react';
import Image from 'next/image';

export function Navbar() {
  const { data: session } = useSession();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? 'bg-white/95 backdrop-blur-md shadow-md py-3'
          : 'bg-transparent py-5'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-center justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 group">
          <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center shadow-glow group-hover:scale-110 transition-transform">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          <span className={`font-display font-bold text-xl transition-colors ${scrolled ? 'text-brand' : 'text-white'}`}>
            Wander<span className="text-amber">Plot</span>
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-1">
          {[
            { href: '/#destinations', label: 'Destinations' },
            { href: '/#how-it-works', label: 'How it works' },
          ].map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`px-3 py-2 rounded-full text-sm font-medium transition-colors
                ${scrolled ? 'text-gray-700 hover:bg-gray-100 hover:text-brand'
                           : 'text-white/90 hover:bg-white/10 hover:text-white'}`}
            >
              {l.label}
            </Link>
          ))}
          {session && (
            <Link
              href="/dashboard"
              className={`px-3 py-2 rounded-full text-sm font-medium transition-colors
                ${scrolled ? 'text-gray-700 hover:bg-gray-100 hover:text-brand'
                           : 'text-white/90 hover:bg-white/10 hover:text-white'}`}
            >
              My Trips
            </Link>
          )}
        </div>

        {/* Auth */}
        <div className="hidden md:flex items-center gap-3">
          {session ? (
            <div className="relative">
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                className="flex items-center gap-2 rounded-full border-2 border-brand/20 px-3 py-1.5 hover:border-brand transition-colors bg-white shadow-sm"
              >
                {session.user?.image ? (
                  <Image
                    src={session.user.image}
                    alt="avatar"
                    width={28}
                    height={28}
                    className="rounded-full"
                  />
                ) : (
                  <User className="w-5 h-5 text-brand" />
                )}
                <span className="text-sm font-medium text-brand max-w-24 truncate">
                  {session.user?.name?.split(' ')[0]}
                </span>
              </button>

              {dropdownOpen && (
                <div className="absolute right-0 top-12 w-52 bg-white rounded-2xl shadow-card-hover border border-gray-100 overflow-hidden animate-slide-up">
                  <Link
                    href="/dashboard"
                    className="flex items-center gap-3 px-4 py-3 hover:bg-cream transition-colors text-gray-700"
                    onClick={() => setDropdownOpen(false)}
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    <span className="text-sm font-medium">Dashboard</span>
                  </Link>
                  <Link
                    href="/dashboard#wishlist"
                    className="flex items-center gap-3 px-4 py-3 hover:bg-cream transition-colors text-gray-700"
                    onClick={() => setDropdownOpen(false)}
                  >
                    <Heart className="w-4 h-4" />
                    <span className="text-sm font-medium">Wishlist</span>
                  </Link>
                  <hr className="border-gray-100" />
                  <button
                    onClick={() => { signOut(); setDropdownOpen(false); }}
                    className="flex items-center gap-3 px-4 py-3 hover:bg-red-50 text-red-500 transition-colors w-full"
                  >
                    <LogOut className="w-4 h-4" />
                    <span className="text-sm font-medium">Sign Out</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <>
              <Link href="/auth/signin" className={`text-sm font-medium transition-colors
                ${scrolled ? 'text-gray-600 hover:text-brand' : 'text-white/80 hover:text-white'}`}>
                Sign In
              </Link>
              <Link href="/plan" className="btn-primary text-sm px-5 py-2.5">
                Start Planning <ArrowRight className="w-4 h-4 ml-1" />
              </Link>
            </>
          )}
        </div>

        {/* Mobile menu button */}
        <button
          className={`md:hidden p-2 rounded-xl transition-colors ${scrolled ? 'text-brand hover:bg-gray-100' : 'text-white hover:bg-white/10'}`}
          onClick={() => setMenuOpen(!menuOpen)}
        >
          {menuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="md:hidden bg-white border-t border-gray-100 shadow-lg animate-slide-up">
          <div className="px-4 py-4 flex flex-col gap-3">
            <Link href="/#destinations" className="font-medium text-gray-700 py-2" onClick={() => setMenuOpen(false)}>
              Destinations
            </Link>
            <Link href="/#how-it-works" className="font-medium text-gray-700 py-2" onClick={() => setMenuOpen(false)}>
              How it works
            </Link>
            {session && (
              <Link href="/dashboard" className="font-medium text-gray-700 py-2" onClick={() => setMenuOpen(false)}>
                My Trips
              </Link>
            )}
            <Link href="/plan" className="btn-primary text-sm text-center py-3" onClick={() => setMenuOpen(false)}>
              Start Planning <ArrowRight className="w-4 h-4 inline ml-1" />
            </Link>
            {session ? (
              <button
                onClick={() => signOut()}
                className="text-left text-red-500 font-medium py-2"
              >
                Sign Out
              </button>
            ) : (
              <Link href="/auth/signin" className="text-gray-600 font-medium py-2" onClick={() => setMenuOpen(false)}>
                Sign In
              </Link>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
