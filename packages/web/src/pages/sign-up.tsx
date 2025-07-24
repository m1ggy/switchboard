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
});

type Schema = z.infer<typeof signUpSchema>;

function SignUp() {
  const form = useForm<Schema>({
    resolver: zodResolver(signUpSchema),
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

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex-1 justify-center items-center w-full flex">
        <Card className="p-5 w-md">
          <CardTitle className="text-md text-center">
            <div className="flex justify-center">
              <img
                src={`/calliya-logo.png`}
                alt="Calliya"
                className="w-[160px] h-auto object-contain"
              />
            </div>
            <span>Create your Calliya account</span>
          </CardTitle>

          <CardContent>
            <CardDescription>
              <Form {...form}>
                <form
                  className="flex flex-col gap-4"
                  onSubmit={form.handleSubmit(onSubmit)}
                >
                  <FormField
                    control={form.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="First Name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="last_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="Last Name" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email</FormLabel>
                        <FormControl>
                          <Input {...field} type="email" placeholder="Email" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="password"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Password</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            type="password"
                            placeholder="Password"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="flex flex-col gap-2">
                    <Button type="submit" disabled={loading}>
                      {loading ? <Loader /> : 'Sign Up'}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={loading}
                      onClick={handleGoogleSignUp}
                    >
                      {loading ? <Loader /> : 'Sign Up with Google'}
                    </Button>
                  </div>

                  {error && (
                    <p className="text-red-300 text-sm font-semibold">
                      {error}
                    </p>
                  )}
                </form>
              </Form>

              <div className="mt-5 text-center">
                <span>
                  Already have an account? <Link to={'/signin'}>Sign in</Link>
                </span>
              </div>
            </CardDescription>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default SignUp;
