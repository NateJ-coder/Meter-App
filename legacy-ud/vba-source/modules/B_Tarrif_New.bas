Attribute VB_Name = "B_Tarrif_New"


Public Function LoadTarrifsNew(TariffName As String) As Boolean
     
    Erase ElecLiters
    Erase ElecCost
    Erase WaterLiters
    Erase WaterCost
    Erase SanLiters
    Erase SanCost

    Dim offsetY As Integer
    Dim ws As Worksheet
    Set ws = ThisWorkbook.Worksheets("Tariffs")
    
    Dim foundCell As Range
    Set foundCell = ws.Columns("B").Find(What:=TariffName, LookIn:=xlValues, LookAt:=xlPart, SearchOrder:=xlByRows, SearchDirection:=xlNext, MatchCase:=False)
    
    On Error Resume Next
    If foundCell Is Nothing Then
        MsgBox ("Tariff: " & TariffName & " does not exist in coloumn B of the Tarrif sheet")
    Else
        offsetY = foundCell.Row
        
        For i = 0 To 7
        
            WaterLiters(i) = Val(Split(ws.Cells(offsetY + i, "C").Value, "-")(1))
            WaterCost(i) = ws.Cells(offsetY + i, "D").Value
            
            ElecLiters(i) = Val(Split(ws.Cells(offsetY + i, "F").Value, "<")(1))
            ElecCost(i) = ws.Cells(offsetY + i, "G").Value
            
            SanLiters(i) = Val(Split(ws.Cells(offsetY + i, "I").Value, "<")(1))
            SanCost(i) = ws.Cells(offsetY + i, "J").Value
         
        Next i
    End If
      
    LoadTarrifsNew = True
    
End Function
 
Public Function GetElecCostsNew(litersUsed As Double, Units As Double) As Double

    Dim totalCost As Double
    Dim remainingLiters As Double
    Dim i As Integer
    For i = 0 To 7
        ElecLitersUnits(i) = ElecLiters(i) * Units
    Next
    totalCost = 0
    remainingLiters = Val(litersUsed)
    
    For i = 0 To 7
        If i = 0 Then
            ElecDiff = ElecLitersUnits(i)
        Else
            ElecDiff = (ElecLitersUnits(i) - ElecLitersUnits(i - 1))
        End If
        If remainingLiters <= ElecDiff Then
            totalCost = totalCost + (remainingLiters * (ElecCost(i) / 100))
            Exit For
        Else
            totalCost = totalCost + (ElecDiff * (ElecCost(i) / 100))
        End If
        remainingLiters = remainingLiters - ElecDiff
    Next i
    GetElecCostsNew = totalCost
    
     
    
End Function
 
Public Function GetWaterCostsNew(litersUsed As Double, Units As Double) As Double
    Dim totalCost As Double
    Dim remainingLiters As Double
    Dim i As Integer
    For i = 0 To 7
        WaterLitersUnits(i) = WaterLiters(i) * Units
    Next
    
    totalCost = 0
    remainingLiters = Val(litersUsed)
    
    For i = 0 To 7
        If i = 0 Then
            WaterDiff = WaterLitersUnits(i)
        Else
            WaterDiff = (WaterLitersUnits(i) - WaterLitersUnits(i - 1))
        End If
    
        If remainingLiters <= WaterDiff Then
            totalCost = totalCost + (remainingLiters * (WaterCost(i) / 1))
            Exit For
        Else
            totalCost = totalCost + (WaterDiff * (WaterCost(i) / 1))
        End If
        remainingLiters = remainingLiters - WaterDiff
    Next i
    GetWaterCostsNew = totalCost
    
End Function
  
  
Public Function GetSanCostsNew(litersUsed As Double, Units As Double) As Double
    Dim totalCost As Double
    Dim remainingLiters As Double
    Dim i As Integer
    For i = 0 To 7
        SanLitersUnits(i) = SanLiters(i) * Units
    Next
    totalCost = 0
    remainingLiters = Val(litersUsed)
    
    For i = 0 To 7
        If i = 0 Then
            SanDiff = SanLitersUnits(i)
        Else
            SanDiff = (SanLitersUnits(i) - SanLitersUnits(i - 1))
        End If
    
        If remainingLiters <= SanDiff Then
            totalCost = totalCost + (remainingLiters * (SanCost(i) / 1))
            Exit For
        Else
            totalCost = totalCost + (SanDiff * (SanCost(i) / 1))
        End If
        remainingLiters = remainingLiters - SanDiff
    Next i
    GetSanCostsNew = totalCost
    
End Function

 
