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
import { zodResolver } from '@hookform/resolvers/zod';
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

const signInSchema = z.object({
  email: z.string().min(1, 'Required').email(),
  password: z.string().min(1, 'Required'),
});

type Schema = z.infer<typeof signInSchema>;

function SignIn() {
  const form = useForm<Schema>({
    resolver: zodResolver(signInSchema),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const setUser = useMainStore((state) => state.setUser);

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
          setError('Email or password is invalid, Please try again.');
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
      setUser(result.user);
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
    <div className="min-h-screen flex flex-col">
      {/* <Header /> */}
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
            <span>Sign in to Calliya</span>
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

                  <div className="flex justify-center">
                    <Button type="submit" disabled={loading} className="w-auto">
                      {loading ? <Loader /> : 'Sign In'}
                    </Button>
                  </div>
                  {error && (
                    <p className="text-red-300 text-sm font-semibold text-center">
                      {error}
                    </p>
                  )}
                </form>
              </Form>
              <div className="text-sm text-center mb-2 text-muted-foreground">
                or
              </div>

              <div className="flex justify-center mb-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={handleGoogleSignIn}
                  disabled={loading}
                >
                  {loading ? <Loader /> : 'Continue with Google'}
                </Button>
              </div>

              <div className="mt-5 text-center">
                <span>
                  Need an account? <Link to={'/sign-up'}>Create one!</Link>
                </span>
              </div>
            </CardDescription>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default SignIn;
