/*
  Warnings:

  - Made the column `correo` on table `usuarios` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `usuarios` MODIFY `correo` VARCHAR(191) NOT NULL;
