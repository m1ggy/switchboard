import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import type { FirebaseError } from 'firebase/app';
import {
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
} from 'firebase/auth';
import { useState } from 'react';
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
import { Eye, EyeOff, LogIn } from 'lucide-react';

const signInSchema = z.object({
  email: z.string().min(1, 'Required').email(),
  password: z.string().min(1, 'Required'),
});

type Schema = z.infer<typeof signInSchema>;

function SignIn() {
  const form = useForm<Schema>({ resolver: zodResolver(signInSchema) });
  const trpc = useTRPC();
  const [loading, setLoading] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const setUser = useMainStore((state) => state.setUser);
  const createUser = useMutation(trpc.users.createUser.mutationOptions());

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
      <main className="flex-1 flex items-center justify-center">
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
            </CardDescription>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default SignIn;
