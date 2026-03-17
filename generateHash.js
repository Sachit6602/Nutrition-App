import bcrypt from 'bcrypt';

(async () => {
  const password = 'qwerty'; // Replace with the password you want to hash
  const hash = await bcrypt.hash(password, 10);
  console.log('Hashed Password:', hash);
})();