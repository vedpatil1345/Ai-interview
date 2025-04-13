"use client"
import Link from 'next/link';
import { Button } from '../ui/button';
import { SignedIn, SignedOut , SignInButton , UserButton} from '@clerk/nextjs';
export default function Header() {
  

  return (
    <header className="backdrop-blur-lg absolute top-0 right-0 left-0 z-50 bg-white/50 border-b border-gray-200 shadow-gray-600/20 shadow-md">
      <div className="container mx-auto px-6 py-4 flex justify-between items-center">
        <Link href='/' className="flex items-center space-x-2 cursor-pointer" >
          <div className="text-blue-600 text-2xl font-bold">Alpha</div>
          <span className="text-gray-400 text-sm">|</span>
          <div className="text-gray-700">AI Interview Simulator</div>
        </Link>
        <nav className="flex items-center space-x-6">
          <Link href="/" className="text-gray-600 hover:text-gray-800">
            Home
          </Link>
          <SignedIn>
          <Link href="/dashboard" className="text-gray-600 hover:text-gray-800">
            Dashboard
          </Link>
          <Link href="/simulation" className="text-gray-600 hover:text-gray-800">
          Simulation
          </Link>
          </SignedIn>
          <div>
            <SignedOut>
            <SignInButton forceRedirectUrl="/">
              <Button variant="outline" className="text-black">Login/Signup</Button>
            </SignInButton>
          </SignedOut>
          <SignedIn>
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "w-10 h-10",
                },
              }}
            />
          </SignedIn>
            </div>
        </nav>
      </div>
    </header>
  );
}