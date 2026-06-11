export default async function handler(req, res) {
  const users = [
    {
      email: "mailhsingchen@gmail.com",
      display_name: "Admin",
      role: "admin",
      active: true
    }
  ];

  res.status(200).json(users);
}
