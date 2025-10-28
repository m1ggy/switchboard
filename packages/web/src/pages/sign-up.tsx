import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
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
import { auth } from '@/lib/firebase';
import useMainStore from '@/lib/store';
import { useTRPC } from '@/lib/trpc';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import type { FirebaseError } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  signInWithPopup,
} from 'firebase/auth';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';
import z from 'zod';

const signUpSchema = z.object({
  first_name: z.string().min(1, 'First name is required'),
  last_name: z.string().min(1, 'Last name is required'),
  email: z.string().min(1, 'Required').email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  // Must be checked (true)
  accept_terms: z.boolean({
    errorMap: () => ({ message: 'You must accept the Terms & Conditions' }),
  }),
});

type Schema = z.infer<typeof signUpSchema>;

function SignUp() {
  const form = useForm<Schema>({
    resolver: zodResolver(signUpSchema),
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      password: '',
      accept_terms: false,
    },
    mode: 'onTouched',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const setUser = useMainStore((state) => state.setUser);
  const trpc = useTRPC();
  const createUser = useMutation(trpc.users.createUser.mutationOptions());

  const onSubmit = async (data: Schema) => {
    setLoading(true);
    setError(null);

    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        data.email,
        data.password
      );

      const user = credential.user;
      setUser(user);

      await createUser.mutateAsync({
        email: data.email,
        first_name: data.first_name,
        last_name: data.last_name,
        uid: user.uid,
      });

      navigate('/onboarding');
    } catch (error) {
      const firebaseError = error as FirebaseError;
      switch (firebaseError.code) {
        case 'auth/email-already-in-use':
          setError('This email is already in use.');
          break;
        case 'auth/invalid-email':
          setError('The email address is not valid.');
          break;
        case 'auth/weak-password':
          setError('The password is too weak.');
          break;
        default:
          setError('An unexpected error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    setLoading(true);
    setError(null);

    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);

      const user = result.user;
      setUser(user);

      const nameParts = (user.displayName ?? '').split(' ');
      const first_name = nameParts[0] ?? '';
      const last_name = nameParts.slice(1).join(' ') || '';

      await createUser.mutateAsync({
        email: user.email ?? '',
        first_name,
        last_name,
        uid: user.uid,
      });

      navigate('/dashboard');
    } catch (error) {
      const firebaseError = error as FirebaseError;
      if (firebaseError.code === 'auth/popup-closed-by-user') {
        setError('Google sign-in popup was closed.');
      } else {
        setError('Google sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const acceptTerms = form.watch('accept_terms', false);

  return (
    <div
      className="min-h-dvh flex flex-col bg-background
                 pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]
                 px-4 sm:px-6"
    >
      <main className="flex-1 flex items-center justify-center">
        <Card className="w-full max-w-[22rem] sm:max-w-md shadow-sm">
          <CardTitle className="text-lg sm:text-xl text-center px-4 pt-6">
            <div className="flex justify-center mb-2">
              <img
                src="/calliya-logo.png"
                alt="Calliya"
                className="w-28 sm:w-40 h-auto object-contain"
              />
            </div>
            <span className="block">Create your Calliya account</span>
          </CardTitle>

          <CardContent className="px-4 sm:px-6 pb-6">
            <CardDescription className="text-sm sm:text-base">
              <Form {...form}>
                <form
                  className="flex flex-col gap-3 sm:gap-4"
                  onSubmit={form.handleSubmit(onSubmit)}
                >
                  <FormField
                    control={form.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm sm:text-[0.95rem]">
                          First Name
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="First name"
                            autoComplete="given-name"
                            className="h-10 sm:h-11"
                          />
                        </FormControl>
                        <FormMessage className="text-xs sm:text-sm" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="last_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="text-sm sm:text-[0.95rem]">
                          Last Name
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="Last name"
                            autoComplete="family-name"
                            className="h-10 sm:h-11"
                          />
                        </FormControl>
                        <FormMessage className="text-xs sm:text-sm" />
                      </FormItem>
                    )}
                  />

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
                            placeholder="you@example.com"
                            className="h-10 sm:h-11"
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
                          <Input
                            {...field}
                            type="password"
                            autoComplete="new-password"
                            placeholder="At least 6 characters"
                            className="h-10 sm:h-11"
                          />
                        </FormControl>
                        <FormMessage className="text-xs sm:text-sm" />
                      </FormItem>
                    )}
                  />

                  {/* Accept Terms */}
                  <FormField
                    control={form.control}
                    name="accept_terms"
                    render={({ field }) => (
                      <FormItem className="flex flex-row items-start gap-3 rounded-md border p-3">
                        <FormControl>
                          <Checkbox
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            aria-label="Accept Terms and Conditions"
                          />
                        </FormControl>
                        <div className="space-y-1 leading-none">
                          <span className="text-sm font-normal">
                            I agree to the{' '}
                            <span className="underline text-sm w-fit cursor-pointer">
                              Terms & Conditions
                            </span>{' '}
                            and{' '}
                            <span className="underline text-sm cursor-pointer">
                              Privacy Policy
                            </span>
                          </span>
                          <FormMessage className="text-xs sm:text-sm" />
                        </div>
                      </FormItem>
                    )}
                  />

                  <div className="flex flex-col gap-2">
                    <Button
                      type="submit"
                      disabled={loading || !acceptTerms}
                      className="w-full h-10 sm:h-11 text-sm sm:text-base"
                    >
                      {loading ? <Loader /> : 'Sign Up'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={loading}
                      onClick={handleGoogleSignUp}
                      className="w-full h-10 sm:h-11 text-sm sm:text-base"
                    >
                      {loading ? <Loader /> : 'Sign Up with Google'}
                    </Button>
                  </div>

                  {error && (
                    <p className="text-destructive text-xs sm:text-sm font-medium text-center">
                      {error}
                    </p>
                  )}
                </form>
              </Form>

              <div className="mt-5 text-center">
                <span className="underline text-xs sm:text-sm">
                  <Link to="/sign-in">Already have an account? Sign in</Link>
                </span>
              </div>
            </CardDescription>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

export default SignUp;
