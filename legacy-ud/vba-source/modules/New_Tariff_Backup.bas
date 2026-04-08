Attribute VB_Name = "New_Tariff_Backup"
''    Public ElecLiters(7) As Double
''    Public ElecCost(7) As Double
''    Public WaterLiters(7) As Double
''    Public WaterCost(7) As Double
''    Public SanLiters(7) As Double
''    Public SanCost(7) As Double
''
''
''
''Sub LoadSanTariffs(TariffName As String)
''
''    Erase ElecLiters
''    Erase ElecCost
''    Erase WaterLiters
''    Erase WaterCost
''    Erase SanLiters
''    Erase SanCost
''
''    Dim offsetY As Integer
''    Dim ws As Worksheet
''    Set ws = ThisWorkbook.Worksheets("Tariffs")
''
''    Dim foundCell As Range
''    Set foundCell = ws.Columns("B").Find(What:=TariffName, LookIn:=xlValues, LookAt:=xlPart, SearchOrder:=xlByRows, SearchDirection:=xlNext, MatchCase:=False)
''
''    On Error Resume Next
''    If foundCell Is Nothing Then
''        MsgBox ("Tariff: " & TariffName & " does not exist in coloumn B of the Tarrif sheet")
''    Else
''        offsetY = foundCell.Row
''
''        For i = 0 To 7
''
''            WaterLiters(i) = Val(Split(ws.Cells(offsetY + i, "C").Value, "-")(1))
''            WaterCost(i) = ws.Cells(offsetY + i, "D").Value
''
''            ElecLiters(i) = Val(Split(ws.Cells(offsetY + i, "F").Value, "<")(1))
''            ElecCost(i) = ws.Cells(offsetY + i, "G").Value
''
''            SanLiters(i) = Val(Split(ws.Cells(offsetY + i, "I").Value, "<")(1))
''            SanCost(i) = ws.Cells(offsetY + i, "J").Value
''
''        Next i
''    End If
''
''    ShowTables
''
''End Sub
''   Sub ShowTables()
''    For i = 0 To 7
''        Debug.Print WaterLiters(i), WaterCost(i), ElecLiters(i), ElecCost(i), SanLiters(i), SanCost(i)
''    Next
''End Sub
''
''Sub GetWaterCostA()
'' TestThis
''    litersUsed = Sheets("Tariffs").Range("QCWaterUnits").Value
''
''    Dim totalCost As Double
''    Dim remainingLiters As Double
''    Dim i As Integer
''
''    totalCost = 0
''    remainingLiters = Val(litersUsed)
''
''    For i = 0 To 7
''        If i = 0 Then
''            WaterDiff = WaterLiters(i)
''        Else
''            WaterDiff = (WaterLiters(i) - WaterLiters(i - 1))
''        End If
''
''        If remainingLiters <= WaterDiff Then
''            totalCost = totalCost + (remainingLiters * WaterCost(i))
''            Exit For
''        Else
''            totalCost = totalCost + (WaterDiff * WaterCost(i))
''        End If
''        remainingLiters = remainingLiters - WaterDiff
''
''    Next i
''
''    Sheets("Tariffs").Range("QCWaterCostExcl").Value = totalCost
''
''End Sub
''
''Function CalcWaterCost(litersUsed) As Double
''    ' Remember to load Tariff Table data first
''
''    Dim totalCost As Double
''    Dim remainingLiters As Double
''    Dim i As Integer
''
''    totalCost = 0
''    remainingLiters = Val(litersUsed)
''
''    For i = 0 To 7
''        If i = 0 Then
''            WaterDiff = WaterLiters(i)
''        Else
''            WaterDiff = (WaterLiters(i) - WaterLiters(i - 1))
''        End If
''
''        If remainingLiters <= WaterDiff Then
''            totalCost = totalCost + (remainingLiters * WaterCost(i))
''            Exit For
''        Else
''            totalCost = totalCost + (WaterDiff * WaterCost(i))
''        End If
''
''        remainingLiters = remainingLiters - WaterDiff
''
''    Next i
''
''    CalcWaterCost = totalCost
''
''End Function
''
