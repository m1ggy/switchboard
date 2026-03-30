import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import type { FirebaseError } from 'firebase/app';
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import z from 'zod';

import { auth } from '@/lib/firebase';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import Loader from '@/components/ui/loader';
import {
  Download,
  Eye,
  EyeOff,
  LogIn,
  Monitor,
  Smartphone,
} from 'lucide-react';

const signInSchema = z.object({
  email: z.string().min(1, 'Required').email(),
  password: z.string().min(1, 'Required'),
});

type Schema = z.infer<typeof signInSchema>;

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches ?? false;
}

function isIOSStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  // @ts-expect-error iOS Safari-specific property
  return !!window.navigator?.standalone;
}

function isInstalled(): boolean {
  return isStandaloneDisplay() || isIOSStandalone();
}

function getDeviceKind() {
  if (typeof navigator === 'undefined') return 'desktop' as const;

  const ua = navigator.userAgent || '';
  const isMobile = /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(
    ua
  );

  if (!isMobile) return 'desktop' as const;
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios' as const;
  if (/Android/i.test(ua)) return 'android' as const;

  return 'mobile' as const;
}

function SignIn() {
  const form = useForm<Schema>({ resolver: zodResolver(signInSchema) });
  const trpc = useTRPC();
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installed, setInstalled] = useState(false);
  const navigate = useNavigate();
  const setUser = useMainStore((state) => state.setUser);
  const createUser = useMutation(trpc.users.createUser.mutationOptions());

  useEffect(() => {
    setInstalled(isInstalled());

    const onInstalled = () => setInstalled(true);
    window.addEventListener('appinstalled', onInstalled);

    const mq = window.matchMedia?.('(display-mode: standalone)');
    const onModeChange = () => setInstalled(isInstalled());
    mq?.addEventListener?.('change', onModeChange);

    return () => {
      window.removeEventListener('appinstalled', onInstalled);
      mq?.removeEventListener?.('change', onModeChange);
    };
  }, []);

  const deviceKind = useMemo(() => getDeviceKind(), []);
  const isDesktop = deviceKind === 'desktop';
  const isAndroid = deviceKind === 'android';
  const isIOS = deviceKind === 'ios';
  const isMobileDevice = !isDesktop;

  const onSubmit = async (data: Schema) => {
    setLoading(true);
    setError(null);
    try {
      const credential = await signInWithEmailAndPassword(
        auth,
        data.email,
        data.password
      );
      setUser(credential.user);
      navigate('/dashboard');
    } catch (error) {
      const firebaseError = error as unknown as FirebaseError;
      switch (firebaseError.code) {
        case 'auth/invalid-email':
          setError('The email address is not valid.');
          break;
        case 'auth/user-disabled':
          setError('This user account has been disabled.');
          break;
        case 'auth/user-not-found':
          setError('No user found with this email.');
          break;
        case 'auth/wrong-password':
          setError('Incorrect password. Please try again.');
          break;
        case 'auth/too-many-requests':
          setError('Too many failed attempts. Please try again later.');
          break;
        case 'auth/invalid-credential':
          setError('Email or password is invalid. Please try again.');
          break;
        default:
          setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const { user } = result;
      setUser(user);

      const nameParts = (user.displayName ?? '').split(' ');
      const first_name = nameParts[0] ?? '';
      const last_name = nameParts.slice(1).join(' ') || '';

      await createUser
        .mutateAsync({
          email: user.email ?? '',
          first_name,
          last_name,
          uid: user.uid,
        })
        .catch();

      navigate('/dashboard');
    } catch (error) {
      const firebaseError = error as FirebaseError;
      switch (firebaseError.code) {
        case 'auth/popup-closed-by-user':
          setError('Google sign-in popup was closed.');
          break;
        case 'auth/cancelled-popup-request':
          setError('Google sign-in was canceled.');
          break;
        default:
          setError('Failed to sign in with Google. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="
        min-h-svh flex flex-col bg-background
        pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]
        px-4
        sm:px-6
      "
    >
      <main className="flex-1 flex items-center justify-center py-6">
        <Card
          className="
            w-full
            max-w-[22rem] sm:max-w-md md:max-w-lg
            shadow-sm
            rounded-2xl
          "
        >
          <CardTitle className="text-lg sm:text-xl text-center px-4 pt-6">
            <div className="flex justify-center mb-2">
              <img
                src="/calliya-logo.png"
                alt="Calliya"
                className="w-28 sm:w-40 h-auto object-contain"
                loading="eager"
                decoding="async"
              />
            </div>
            <span className="block">Sign in to Calliya</span>
          </CardTitle>

          <CardContent className="px-4 sm:px-6 pb-6">
            <CardDescription className="text-sm sm:text-base">
              <Form {...form}>
                <form
                  className="flex flex-col gap-3 sm:gap-4"
                  onSubmit={form.handleSubmit(onSubmit)}
                  aria-busy={loading}
                >
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm sm:text-[0.95rem]">
                          Email
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="email"
                            inputMode="email"
                            autoComplete="email"
                            autoCapitalize="none"
                            autoCorrect="off"
                            placeholder="you@example.com"
                            className="h-11 sm:h-12 text-sm sm:text-base"
                          />
                        </FormControl>
                        <FormMessage className="text-xs sm:text-sm" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm sm:text-[0.95rem]">
                          Password
                        </FormLabel>
                        <FormControl>
                          <div className="relative">
                            <Input
                              {...field}
                              type={showPw ? 'text' : 'password'}
                              autoComplete="current-password"
                              placeholder="••••••••"
                              className="h-11 sm:h-12 pr-12 text-sm sm:text-base"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPw((s) => !s)}
                              className="
                                absolute inset-y-0 right-2 grid place-items-center
                                px-2 rounded-md
                                hover:bg-accent/40 active:bg-accent
                                transition
                                motion-reduce:transition-none
                              "
                              aria-label={
                                showPw ? 'Hide password' : 'Show password'
                              }
                              tabIndex={-1}
                            >
                              {showPw ? (
                                <EyeOff className="size-5" aria-hidden />
                              ) : (
                                <Eye className="size-5" aria-hidden />
                              )}
                            </button>
                          </div>
                        </FormControl>
                        <FormMessage className="text-xs sm:text-sm" />
                      </FormItem>
                    )}
                  />

                  <Button
                    type="submit"
                    disabled={loading}
                    className="w-full h-11 sm:h-12 text-sm sm:text-base mt-1"
                  >
                    {loading ? (
                      <Loader />
                    ) : (
                      <span className="inline-flex items-center gap-2">
                        <LogIn className="size-4" />
                        Sign In
                      </span>
                    )}
                  </Button>

                  <div
                    className="min-h-5"
                    aria-live="polite"
                    aria-atomic="true"
                    role="status"
                  >
                    {error && (
                      <p className="text-destructive text-xs sm:text-sm font-medium text-center mt-2">
                        {error}
                      </p>
                    )}
                  </div>
                </form>
              </Form>

              <div className="text-xs sm:text-sm text-center my-3 sm:my-4 text-muted-foreground">
                or
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={handleGoogleSignIn}
                disabled={loading}
                className="w-full h-11 sm:h-12 text-sm sm:text-base"
              >
                {loading ? <Loader /> : 'Continue with Google'}
              </Button>

              <div className="mt-5 text-center">
                <span className="underline text-xs sm:text-sm">
                  <Link to="/sign-up">Need an account? Create one!</Link>
                </span>
              </div>

              {!installed && (
                <div className="mt-6 rounded-xl border bg-muted/30 p-4 text-left">
                  <div className="mb-2 flex items-center gap-2">
                    {isMobileDevice ? (
                      <Smartphone className="size-4" />
                    ) : (
                      <Monitor className="size-4" />
                    )}
                    <p className="font-medium text-foreground">
                      Install the Calliya app
                    </p>
                  </div>

                  {isAndroid && (
                    <div className="space-y-2 text-xs sm:text-sm text-muted-foreground">
                      <p className="text-foreground font-medium">Android</p>
                      <ol className="list-decimal pl-5 space-y-1">
                        <li>Open this page on your Android device.</li>
                        <li>
                          Go to{' '}
                          <span className="font-medium">app.calliya.com</span>.
                        </li>
                        <li>
                          On the homepage, below the log in button, tap{' '}
                          <span className="font-medium">Install the App</span>.
                        </li>
                        <li>Confirm the install prompt.</li>
                        <li>
                          The app will install and appear on your home screen
                          automatically.
                        </li>
                      </ol>
                    </div>
                  )}

                  {isIOS && (
                    <div className="space-y-2 text-xs sm:text-sm text-muted-foreground">
                      <p className="text-foreground font-medium">
                        iPhone / iPad
                      </p>
                      <ol className="list-decimal pl-5 space-y-1">
                        <li>
                          Open this page in{' '}
                          <span className="font-medium">Safari</span>.
                        </li>
                        <li>
                          Go to{' '}
                          <span className="font-medium">app.calliya.com</span>.
                        </li>
                        <li>
                          On the homepage, tap the{' '}
                          <span className="font-medium">Share</span> button.
                        </li>
                        <li>
                          Select{' '}
                          <span className="font-medium">
                            Add to Home Screen
                          </span>
                          .
                        </li>
                        <li>
                          Tap <span className="font-medium">Add</span> to
                          install Calliya on your home screen.
                        </li>
                      </ol>
                    </div>
                  )}

                  {deviceKind === 'mobile' && (
                    <div className="space-y-2 text-xs sm:text-sm text-muted-foreground">
                      <p className="text-foreground font-medium">
                        Mobile Device
                      </p>
                      <ol className="list-decimal pl-5 space-y-1">
                        <li>
                          Open{' '}
                          <span className="font-medium">app.calliya.com</span>{' '}
                          on your phone.
                        </li>
                        <li>
                          Look below the log in button for the install option.
                        </li>
                        <li>Follow the browser prompt to install the app.</li>
                      </ol>
                    </div>
                  )}

                  {isDesktop && (
                    <div className="space-y-2 text-xs sm:text-sm text-muted-foreground">
                      <p>App installation is available on mobile devices.</p>
                      <ol className="list-decimal pl-5 space-y-1">
                        <li>
                          Open{' '}
                          <span className="font-medium">app.calliya.com</span>{' '}
                          on your phone.
                        </li>
                        <li>
                          Below the log in button, tap{' '}
                          <span className="font-medium">Install the App</span>{' '}
                          on Android.
                        </li>
                        <li>
                          On iPhone or iPad, open in{' '}
                          <span className="font-medium">Safari</span>, tap{' '}
                          <span className="font-medium">Share</span>, then{' '}
                          <span className="font-medium">
                            Add to Home Screen
                          </span>
                          .
                        </li>
                      </ol>
                    </div>
                  )}

                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Download className="size-4" />
                    <span>
                      Install it for faster access to messages, calls, and
                      notifications.
                    </span>
                  </div>
                </div>
              )}
            </CardDescription>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default SignIn;
