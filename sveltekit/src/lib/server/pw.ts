import { SERVER_PW_PEPPER } from '$env/static/private';
import bcrypt from 'bcrypt';
import { createSessionJWT, checkJwt } from '$lib/server/jwt';
import prisma from '$lib/server/db';


export async function hashPasswordV2(password: string, userId: string) {
  const pepper = SERVER_PW_PEPPER;
  // console.log('Salt:', salt);
  return await bcrypt.hash(password + pepper + userId, 10);
}

export async function comparePasswordV2(password: string, hashedPassword: string, userId: string) { 
  const pepper = SERVER_PW_PEPPER;
  // console.log('Salt:', salt);
  return await bcrypt.compare(password + pepper + userId, hashedPassword);
}


export async function login(email: string, password: string, cookies: any): Promise<{ success: boolean; error?: string }> {
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user) {
    return { success: false, error: "Ungültige Anmeldedaten. Bitte versuchen Sie es erneut." };
  }

  if (user.isDeleted) {
    return { success: false, error: "Benutzer existiert nicht." };
  }

  let passwordMatch = false;

  if (user.cryptVersion === 0) {
    passwordMatch = (password === user.password);

    if (passwordMatch) {
      let newHashedPassword = await hashPasswordV2(password, user.id);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: newHashedPassword,
          cryptVersion: 2
        }
      });
    }

  } else if (user.cryptVersion === 2) {
    passwordMatch = await comparePasswordV2(password, user.password, user.id);
  } else {
    return { success: false, error: "Unbekannte Passwort-Verschlüsselung." };
  }

  if (!passwordMatch) {
    return { success: false, error: "Ungültige Anmeldedaten. Bitte versuchen Sie es erneut." };
  }

  const token = await createSessionJWT({ userId: user.id });
  cookies.set('jwt', token, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24
  });

  return { success: true };

  
  // return createSessionJWT(user);


}
